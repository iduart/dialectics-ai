import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import OpenAI from "openai";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT || 3000;

// In-memory message storage
const messageStore = new Map();

// Room management for debates
const roomParticipants = new Map(); // roomId -> { participants: [], currentTurn: 0, currentSpeaker: null }
const roomConfigs = new Map(); // roomId -> { description, toleranceLevel, duration }
const turnTimers = new Map(); // roomId -> { timer: Timeout, countdownInterval: Interval, timeLeft: number }

// Voice call: which sockets are in a voice call per room (for 2-person WebRTC mesh signaling)
const roomVoiceParticipants = new Map(); // roomId -> Set<socketId>

// Initialize OpenAI client (primary AI)
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

// AI Service - Simplified for debate moderation
class AIService {
  constructor() {
    this.openai = openai;
  }

  // Check if AI service is available
  isAvailable() {
    return this.openai !== null;
  }

  // AI call method for moderation
  async callAI(systemPrompt, userPrompt) {
    console.log("🔧 AIService.callAI called with:", {
      systemPromptLength: systemPrompt?.length || 0,
      userPromptLength: userPrompt?.length || 0,
      systemPromptPreview: systemPrompt?.substring(0, 100) + "...",
      userPromptPreview: userPrompt?.substring(0, 100) + "...",
    });

    if (!this.isAvailable()) {
      console.log("❌ AIService: OpenAI API not available");
      throw new Error("OpenAI API not available");
    }

    console.log("🔧 AIService: About to call OpenAI API...");
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      console.log("🔧 AIService: OpenAI API call completed");
      console.log("🔧 AIService: Response received:", {
        choicesLength: completion.choices?.length || 0,
        firstChoiceContent:
          completion.choices?.[0]?.message?.content?.substring(0, 100) + "...",
      });

      const result = completion.choices[0]?.message?.content;
      console.log(
        "🔧 AIService: Returning result:",
        result?.substring(0, 100) + "..."
      );
      return result;
    } catch (error) {
      console.error("🔧 AIService: OpenAI API error:", error);
      throw error;
    }
  }

  // Second pass: ask AI if the moderator response means the message deserves a sanction (true/false)
  async shouldSanction(moderatorResponse) {
    if (!this.isAvailable() || !moderatorResponse?.trim()) {
      return false;
    }
    const systemPrompt = `You are a strict classifier. Given a moderator's evaluation of a user message, you must determine if the moderator is applying a sanction (punishment/alert) to the user. Answer with exactly one word: true or false.
- true: the evaluation indicates a sanction (e.g. insult detected, false information, topic deviation, ALERTA, SANCIONAR, negative score, violation).
- false: the evaluation indicates no sanction (e.g. neutral, no action needed, valid information, on-topic, MANTIENE EL TEMA, score 0, no violation).`;
    const userPrompt = `Moderator evaluation:\n${moderatorResponse.trim()}\n\nDoes this message deserve a sanction? Answer only: true or false`;
    try {
      const response = await this.callAI(systemPrompt, userPrompt);
      const normalized = (response || "").trim().toLowerCase();
      const isTrue =
        normalized === "true" ||
        normalized.startsWith("true") ||
        normalized.includes("true");
      console.log("🤖 Should sanction (second pass):", normalized, "→", isTrue);
      return isTrue;
    } catch (error) {
      console.error("AI shouldSanction error:", error);
      return false;
    }
  }

  // AI Moderation with custom prompt
  async moderateMessageWithPrompt(
    message,
    username,
    conversationHistory = [],
    customPrompt,
    initialArgumentsContext = "",
    debateTopicContext = ""
  ) {
    // console.log("🤖 Using custom prompt:", customPrompt);

    // Build conversation context
    let conversationContext = "";
    if (conversationHistory.length > 0) {
      conversationContext = `\n\nRecent conversation context:\n${conversationHistory
        .slice(-10) // Last 10 messages for context
        .map((msg) => `${msg.username}: ${msg.message}`)
        .join("\n")}\n`;
    }

    const userPrompt = `${
      debateTopicContext ? debateTopicContext + "\n\n" : ""
    }${
      initialArgumentsContext ? initialArgumentsContext + "\n\n" : ""
    }${username}: ${message}${conversationContext}`;

    let response;
    try {
      response = await this.callAI(customPrompt || "", userPrompt);
      console.log(
        "🤖 Raw AI response for custom prompt (free-form)1:",
        response
      );

      if (!response || response.trim() === "") {
        console.log("⚠️ Empty AI response received for custom prompt");
        return { shouldRespond: false };
      }

      return {
        shouldRespond: true,
        response: response.trim(),
      };
    } catch (error) {
      console.error("AI Moderation error for custom prompt:", error);
      console.error("Failed to parse response:", response);
      return { shouldRespond: false };
    }
  }

  // Extract a single number (positive points 0–5) from the puntos positivos evaluation text
  async extractPointsNumber(evaluationText) {
    if (!this.isAvailable() || !evaluationText?.trim()) return 0;
    const systemPrompt = `You are a strict number extractor. You will receive an evaluation of a debate intervention that includes a "Score" or "Puntaje" (positive points). Reply with ONLY a single number: the points earned (0 to 5, decimal allowed, e.g. 1.5 or 2.0). No explanation, no other text. If no clear score is found, reply 0.`;
    const userPrompt = `Evaluation:\n${evaluationText.trim()}\n\nReply with only the number (points):`;
    try {
      const response = await this.callAI(systemPrompt, userPrompt);
      const trimmed = (response || "").trim();
      const num = parseFloat(trimmed.replace(/[^\d.]/g, ""), 10);
      const points = Number.isFinite(num) ? Math.max(0, Math.min(5, num)) : 0;
      console.log("🤖 Extracted points from evaluation:", points);
      return points;
    } catch (error) {
      console.error("AI extractPointsNumber error:", error);
      return 0;
    }
  }

  // Extract the negative score (e.g. -3, -5) from a sanction/moderation response
  async extractNegativeScore(sanctionResponse) {
    if (!this.isAvailable() || !sanctionResponse?.trim()) return 0;
    const systemPrompt = `You are a strict number extractor. You will receive a moderator sanction message that may include a "Score" (negative points, e.g. Score: -3 or Score: -5). Reply with ONLY a single number: the negative score as a negative number (e.g. -3 or -5). No explanation. If no negative score is found, reply 0.`;
    const userPrompt = `Sanction message:\n${sanctionResponse.trim()}\n\nReply with only the negative score number (e.g. -3):`;
    try {
      const response = await this.callAI(systemPrompt, userPrompt);
      const trimmed = (response || "").trim();
      const num = parseFloat(trimmed.replace(/[^\d.-]/g, ""), 10);
      const score = Number.isFinite(num) ? Math.min(0, Math.max(-10, num)) : 0;
      console.log("🤖 Extracted negative score from sanction:", score);
      return score;
    } catch (error) {
      console.error("AI extractNegativeScore error:", error);
      return 0;
    }
  }
}

// Initialize AI Service
const aiService = new AIService();

// Turn timer management functions (will be defined inside app.prepare() where io is available)

// Default prompts (to be filled by user)
const DEFAULT_PROMPTS = {
  promptInsultos: `
  1. ROL Y MISIÓN Eres un "Moderador de Civismo". Tu misión es detectar ataques, insultos o agresión verbal según el Nivel de Severidad seleccionado.

2. REGLAS UNIVERSALES DE EVALUACIÓN

A. Escala de Gravedad (Puntaje Base 0-5) Este es el puntaje único que asignas al mensaje antes de aplicar el Factor de Severidad (FS).

0: Neutral, crítica de ideas, o "frases diagnósticas" (ej. "te falta empatía") sin insulto.

1: Emoción intensa, expletivos no dirigidos (ej. "¡joder!").

2: Sarcasmo leve, ambigüedad.

3: Tensión verbal, impacto moderado, provocación.

4: Ofensa clara, insulto personal, agresión verbal dirigida.

5: Agresión grave, deshumanización, amenaza, violencia simbólica manifiesta.

B. FORMATO DE SALIDA OBLIGATORIO (ESTRICTO) Solo genera salida si el veredicto es SANCIONAR. Responde ÚNICAMENTE en Markdown, bien formateado y legible:

**Formato cuando SANCIONAR:** Deja siempre dos líneas en blanco (doble salto de línea) entre: (1) el título y la lista, (2) la lista y el Análisis.
\`\`\`
### 🛑 Alerta de civismo


- **Fragmentos conflictivos:** "[frase 1]" / "[frase 2]"
- **Veredicto:** SANCIONAR
- **Score:** -5 o -3 (si Puntaje Total > 4.5 escribe -5, si no -3)


**Análisis:** [Explicación clara y directa al usuario de por qué es ofensivo]
\`\`\`

Usa encabezados (###), listas con guiones (-), **negrita** en etiquetas y un párrafo final de análisis. No envuelvas la respuesta en bloques de código (\`\`\`); escribe solo el Markdown directamente.
C. Cálculo Final (Uso Interno) Puntaje Total = Puntaje Base (0-5) * Factor de Severidad (FS)

3. Definición de Niveles Progresivos

Nivel 1: Permisible

Filosofía: Prioriza la libertad de expresión. Solo sanciona la hostilidad directa, clara y grave.

Enfoque: Solo evalúa mensajes dirigidos al interlocutor.

Se Ignora: Crítica a ideas, generalizaciones sobre colectivos, ironía, emoción fuerte.

Factor de Severidad (FS): 0.6

Umbral de Sanción: Sancionar si Puntaje Total > 2.5

Nivel 2: Moderado

Filosofía: Protege la fluidez del debate y la dignidad.

Enfoque: Evalúa mensajes dirigidos y casos de gravedad intrínseca (amenazas, insultos graves).

Factor de Severidad (FS): 1.0

Umbral de Sanción: Sancionar si Puntaje Total > 3.5

Nivel 3: Estricto

Filosofía: Alta sensibilidad. Protege la dignidad y previene activamente la hostilidad.

Enfoque: Evalúa todos los mensajes dirigidos y cualquier caso de gravedad intrínseca.

Factor de Severidad (FS): 1.3

Umbral de Sanción: Sancionar si Puntaje Total > 3.5
  `, // Default prompt for insults detection
  promptFactCheck: `
  **1. ROL Y MISIÓN**
Eres un "Fact-Checker" técnico. Tu única misión es determinar si el mensaje contiene desinformación objetiva y verificable.

  * Evalúas: Hechos, datos, cifras, atribuciones.
  * Ignoras: Opiniones, juicios morales, valores, creencias personales e interpretaciones.

**2. PROCESO DE EVALUACIÓN (Validación Interna Secuencial)**
**DEBES** seguir este protocolo estricto antes de emitir un veredicto:

1.  **Identificar:** ¿El mensaje contiene una afirmación factual que pueda ser verificada? Si no hay hechos, tu trabajo termina (Veredicto: No).
2.  **Verificar:** Si hay un hecho, **DEBES USAR LA HERRAMIENTA 'Google Search'**.
3.  **Validar URL:** Revisa los resultados. Debes seleccionar un enlace **funcional y fiable**. Si la búsqueda no arroja un enlace claro y accesible, NO PUEDES SANCIONAR.
4.  **Doble Chequeo:** Confirma que el contenido de ese enlace realmente refuta la afirmación del usuario. Garantiza que el '[Enlace URL]' y el 'Análisis' son mutuamente coherentes. **Prohibido inventar URLs.**

**3. CRITERIOS DE SANCIÓN (Qué buscar)**

  * **Dato Verificable Falso:** La afirmación contradice directamente la evidencia objetiva.
  * **Manipulación de Cifras:** Datos inventados, alterados o sacados de contexto.
  * **Generalización Engañosa:** Usar absolutos sin base factual ("Todos los X son Y").
  * **Atribución Errónea:** Adjudicar falsamente dichos o hechos.

**4. FORMATO DE SALIDA OBLIGATORIO (ESTRICTO)** Tu respuesta debe ser Markdown puro y bien formateado: título (###), bullets con guión (-), etiquetas en **negrita**, y un párrafo **Análisis:**. Prohibido usar bloques de código (\`\`\`) — escribe solo el Markdown para que se renderice en pantalla.

**Si el mensaje NO contiene información no veraz**, usa esta plantilla (sustituye solo el Análisis):

### ✅ Información válida

- **Veredicto:** INFORMACIÓN VÁLIDA
- **Score:** 0

**Análisis:** [Una frase breve explicando por qué no hay problema con la veracidad.]

**Si el mensaje SÍ contiene información no veraz (tras validar URL)**, usa esta plantilla:

### ⚠️ Alerta de veracidad

- **Fragmento:** "[Frase exacta que contiene el dato falso]"
- **Veredicto:** INFORMACIÓN FALSA
- **Score:** -2
- **Fuente:** [Texto descriptivo](URL_funcional)

**Análisis:** [Explicación de la falsedad basada en evidencia. Máximo 2-3 oraciones.]

Recuerda: salto de línea después del título; bullets con - y **negrita** en etiquetas; línea en blanco antes de **Análisis:**. Nunca envuelvas la respuesta en \`\`\`.
  `, // Default prompt for fact checking
  promptDesvioTema: `
  **1. ROL Y MISIÓN**
Eres un "Moderador de Coherencia" técnico. Tu misión no es solo detectar si el mensaje se desvía del tema central, sino también entender y seguir el "hilo" lógico de la conversación.

**2. TEMA CENTRAL (OBLIGATORIO)**
Al inicio del mensaje del usuario recibirás la línea "Tema del debate (TEMATICA CENTRAL): [tema]". **DEBES usar ÚNICAMENTE ese tema** como referencia para evaluar desvíos. No asumas ni inventes otro tema (p. ej. no uses "el aborto" si no es el tema indicado). Si el mensaje trata sobre el tema indicado o sub-temas relacionados, NO es desvío.

**3. CONTEXTO**
Recibirás también el historial reciente de la conversación. Tenlo en cuenta: si el mensaje actual sigue el hilo del debate o responde al turno anterior sobre el mismo tema, NO es desvío.

**4. REGLAS DE EVALUACIÓN (Lógica interna)**

**A. NO SE CONSIDERA DESVÍO (Veredicto: No):**

1.  **Interacciones Sociales:** Saludos ("Hola"), despedidas, cortesías ("Gracias").
2.  **Meta-conversación:** Comentarios sobre el debate ("Ese es un buen punto", "¿Puedes repetir?").
3.  **Argumento Central:** El mensaje trata directamente sobre la TEMATICA CENTRAL indicada al inicio del mensaje.
4.  **Analogías y comparaciones:** El mensaje hace comparaciones o analogías razonables dentro de la lógica del tema central.
      * Ejemplo: Si el tema central es “el tema indicado al inicio del mensaje”, se debe permitir comparaciones con otros casos, así sean llevados al extremo, pero que se refieran a la temática central, de modo que quieran llegar a un punto, haciendo una analogía.
5.  **Sub-temas Lógicos (El Hilo):** El mensaje introduce o discute un sub-tema que es una implicación directa o un pilar argumental del tema central.
      * Ejemplo: Los sub-temas válidos dependen del tema central indicado (ej. si es "celular en clase": enfoque, interrupciones, normas de aula).

**B. SÍ SE CONSIDERA DESVÍO (Veredicto: Sí):**

  * **Desconexión Total:** El mensaje no tiene relación lógica NI con la TEMATICA CENTRAL indicada NI con el argumento del turno inmediatamente anterior.
      * Ejemplo de desvío: tema "uso del celular en clase" y alguien escribe "¿Vieron el partido de fútbol anoche?".

**6. Moción:** Cuando el participante diga moción, se debe entender que esta activando con esa palabra clave a otro Moderador, por lo tanto no debes tomarlo como un desvio de tema, por lo tanto tu veredicto en este caso que se presente esta palabra, será NO.

**4. FORMATO DE SALIDA OBLIGATORIO (ESTRICTO)** Tu respuesta debe ser Markdown puro y bien formateado: título (###), bullets con guión (-), etiquetas en **negrita**, y un párrafo **Análisis:**. Prohibido usar bloques de código (\`\`\`) — escribe solo el Markdown para que se renderice en pantalla.

**Si el mensaje NO se desvía**, usa esta plantilla (sustituye solo el Análisis):

### ✅ Coherencia

- **Veredicto:** MANTIENE EL TEMA
- **Score:** 0

**Análisis:** [Motivo breve: se mantiene en el tema / sigue el hilo / interacción social.]

**Si el mensaje SÍ se desvía**, usa esta plantilla:

### ⚠️ Alerta de desvío

- **Veredicto:** DESVÍO DE TEMA
- **Score:** -2

**Análisis:** [Explicación clara: qué tema introduce el mensaje y por qué rompe la coherencia con el tema principal o el turno anterior. Máximo 2-3 oraciones.]

Recuerda: salto de línea después del título; bullets con - y **negrita** en etiquetas; línea en blanco antes de **Análisis:**. Nunca envuelvas la respuesta en \`\`\`.
  `, // Default prompt for topic deviation detection
  promptPuntosPositivos: `
  **1. ROL Y MISIÓN**
Eres un "Juez de Debate" experto. Tu misión es evaluar la calidad de la intervención actual. No buscas perfección académica, buscas **efectividad comunicativa y lógica**. Asigna un puntaje positivo (0.0 a 5.0) basado en qué tan bien el participante ejecuta las siguientes habilidades.

**2. CRITERIOS Y EVALUACIÓN (Total Máximo: 5.0)**
Evalúa cada criterio. Para asignar puntos, la intervención debe cumplir la **Condición de Calidad**. Si cae en el **Factor de Exclusión**, asigna 0 en ese criterio.

**A. NIVEL BÁSICO (Claridad y Forma)**

  * **1. Respuesta Directa y Clara (Máx 0.2):**
      * *Condición:* Aborda el tema o la pregunta sin rodeos. Se entiende su postura de inmediato.
      * *Exclusión (0 pts):* Divagar, irse por las ramas o evasivas.
  * **2. Coherencia y Estructura (Máx 0.3):**
      * *Condición:* Orden lógico natural. Una idea lleva a la otra fluidamente.
      * *Exclusión (0 pts):* Ideas desordenadas, "muros de texto" o falta de conectores.
  * **5. Uso de Analogías (Máx 0.3):**
      * *Condición:* Usa una comparación ("es como...") que simplifica o visualiza el argumento.
      * *Exclusión (0 pts):* Analogías forzadas, absurdas o confusas.
  * **6. Dominio Temático (Máx 0.2):**
      * *Condición:* Usa los términos técnicos correctos para diferenciar matices.
      * *Exclusión (0 pts):* Palabras rebuscadas innecesarias o uso erróneo de conceptos.

**B. NIVEL LÓGICO (Argumentación y Datos)**

  * **3. Sustento Factual Sólido (Máx 0.8):**
      * *Condición:* Menciona datos, leyes, estudios o hechos concretos para apoyar su opinión.
      * *Exclusión (0 pts):* Datos vagos ("mucha gente"), inventados o generalizaciones.
  * **4. Causa y Efecto (Máx 0.5):**
      * *Condición:* Explica el mecanismo de por qué una acción lleva a una consecuencia.
      * *Exclusión (0 pts):* Saltos lógicos, superstición o correlación sin explicación.
  * **9. Propuesta Constructiva (Máx 0.6):**
      * *Condición:* Propone una solución, alternativa o punto medio viable.
      * *Exclusión (0 pts):* Soluciones utópicas o sarcásticas.

**C. NIVEL ESTRATÉGICO (Interacción y Agudeza)**

  * **7. Preguntas Socráticas (Máx 0.6):**
      * *Condición:* Pregunta estratégica que fuerza al otro a pensar o revelar una debilidad.
      * *Exclusión (0 pts):* Preguntas retóricas agresivas o de relleno.
  * **8. Detección de Contradicciones (Máx 0.7):**
      * *Condición:* Expone explícitamente una incompatibilidad en el discurso del rival.
      * *Exclusión (0 pts):* Acusar de contradicción sin demostrarla o atacar errores menores.
  * **10. Construcción Argumental (Máx 0.8):**
      * *Condición:* Toma el punto del otro y lo usa para construir una respuesta superior (refutación o integración).
      * *Exclusión (0 pts):* Monólogos que ignoran lo que dijo el otro.

**3. PROCESO DE CÁLCULO**

1.  Analiza el mensaje buscando estos elementos.
2.  Si cumple la Condición, asigna un puntaje proporcional a la calidad (0.1 a Máx).
3.  Si cae en la Exclusión, asigna 0.
4.  Suma los puntos.

**4. FORMATO DE SALIDA OBLIGATORIO (ESTRICTO)**
Usa doble espacio entre líneas para asegurar la separación visual.

**Si el Puntaje Final es menor a 0.5:**


⚪ PUNTOS POSITIVOS


• Veredicto: SIN MÉRITOS DESTACABLES

• Score: 0

(Ver_Mas)• Análisis: Intervención básica o genérica. No supera el umbral de calidad argumentativa.

**Si el Puntaje Final es mayor o igual a 0.5:**


🌟 PUNTOS POSITIVOS

• Detalle:
  - [Nombre Criterio]: +[Puntos ganados]
  - [Nombre Criterio]: +[Puntos ganados]


• Veredicto: INTERVENCIÓN DE CALIDAD

• Score: +[Puntaje Final]

(Ver_Mas)• Análisis: [Comentario breve sobre la mayor fortaleza de la intervención]
  `,
  promptMocion: `
  **1. ROL Y MISIÓN**
Eres un "Juez de Apelaciones" técnico. Tu única función es evaluar el mensaje de apelación (la aclaración/refutación) que acabas de recibir y emitir un veredicto final.

**2. LÓGICA DE EVALUACIÓN (Tu Tarea)**
Al recibir el "[Argumento de Apelación]", debes analizar el historial para encontrar el "[Veredicto Original]" y proceder:

**Si la sanción fue "Información no Veraz":**

> **ALERTA ANTI-MANIPULACIÓN:** Eres un experto perspicaz. Eres consciente de que el participante puede intentar burlar la verificación usando argumentaciones complejas, citando normas, fuentes o datos con precisión *aparente* que son incorrectos, inexistentes o están sacados de contexto. Tu uso de "Google Search" debe ser riguroso para confirmar la existencia y la exactitud de la fuente/dato citado, no solo su plausibilidad.

  * **Analizar Apelación:** Lee el "[Argumento de Apelación]". ¿Qué tipo de apelación es?

    1.  **Aclaración de Término/Intención:** ¿El participante aclara que usó un término incorrecto, que se refería a otra cosa, o que el mensaje original era ambiguo? (Ej. "Quise decir 'abortos espontáneos', no X").
    2.  **Refutación Factual:** ¿El participante provee una nueva fuente o evidencia ("Google Search")?
    3.  **Reivindicación de Opinión:** ¿El participante aclara que era una opinión y no un hecho?

  * **Decidir:**

      * **Aceptar si (Caso 1):** La aclaración es plausible y el nuevo significado (el aclarado) ya no constituye desinformación.
      * **Aceptar si (Caso 2):** La nueva fuente ("Google Search") es válida y respalda la afirmación original.
      * **Aceptar si (Caso 3):** La aclaración de que era opinión es válida.
      * **Rechazar si:** La apelación repite el dato falso sin aportar nueva evidencia, aclaración válida u opinión.

**Si la sanción fue "Desvío de Tema":**

  * **Analizar Coherencia:** Lee el "[Argumento de Apelación]" (la explicación) y compárala con el "[Mensaje Sancionado]" y el "[Contexto Previo]".
  * **Decidir:** Aceptar si la explicación de la conexión lógica (analogía, inferencia) es válida, aunque fuera sutil. Rechazar si sigue siendo una desconexión.

**3. FORMATO DE SALIDA OBLIGATORIO (ESTRICTO)**
Usa doble espacio entre líneas para asegurar la separación visual.

**Si la apelación es ACEPTADA:**


⚖️ RESOLUCIÓN DE APELACIÓN


• Veredicto: ACEPTADA

• Score: +2

(Ver_Mas)• Análisis: [Breve explicación de por qué se retira la sanción. Ej: "Se acepta la aclaración del término" o "La nueva fuente es válida".]
**Si la apelación es RECHAZADA:**


⚖️ RESOLUCIÓN DE APELACIÓN


• Veredicto: RECHAZADA

• Score: -1

(Ver_Mas)• Análisis: [Breve explicación de por qué se mantiene la sanción. Ej: "La apelación no corrige la falsedad del dato original" o "La fuente citada no existe".]
  `,
};

// Simple moderation function using the AI service
async function analyzeMessage(message, username, roomId) {
  if (!aiService.isAvailable()) {
    console.log("AI Moderation disabled: No OpenAI API key provided");
    return { shouldRespond: false, results: [] };
  }

  try {
    console.log("🤖 AI analyzing message with multiple prompts...");

    // Get conversation history for context
    const conversationHistory = messageStore.get(roomId) || [];

    // Get debate config for context
    const debateConfig = roomConfigs.get(roomId);

    // Build debate topic context (for Desvío de Tema and general coherence)
    const debateTopicContext = debateConfig?.description?.trim()
      ? `Tema del debate (TEMATICA CENTRAL): ${debateConfig.description.trim()}`
      : "";

    // Build initial arguments context (posturas) from all participants
    const roomData = roomParticipants.get(roomId);
    let initialArgumentsContext = "";
    if (roomData?.participants?.length) {
      const lines = roomData.participants
        .filter((p) => p.initialArgument && String(p.initialArgument).trim())
        .map((p) => `${p.username}: ${p.initialArgument.trim()}`);
      if (lines.length) {
        initialArgumentsContext = `Initial positions / Posturas ante el debate:\n${lines.join(
          "\n"
        )}`;
      }
    }

    // Define prompts with their names and use custom or default values
    const prompts = [
      {
        name: "Insultos",
        value:
          debateConfig?.promptInsultos || DEFAULT_PROMPTS.promptInsultos || "",
      },
      {
        name: "Fact Check",
        value:
          debateConfig?.promptFactCheck ||
          DEFAULT_PROMPTS.promptFactCheck ||
          "",
      },
      {
        name: "Desvío de Tema",
        value:
          debateConfig?.promptDesvioTema ||
          DEFAULT_PROMPTS.promptDesvioTema ||
          "",
      },
    ].filter((p) => p.value.trim() !== ""); // Only include non-empty prompts

    // If no prompts available (all empty), no analysis needed
    if (prompts.length === 0) {
      console.log(`✅ No prompts configured, skipping AI analysis`);
      return { shouldRespond: false, results: [] };
    }

    // Analyze with multiple prompts
    const results = [];
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      let promptValue = prompt.value;
      // For Desvío de Tema, inject the actual debate topic into the prompt so the model uses it (not hardcoded examples)
      if (
        prompt.name === "Desvío de Tema" &&
        debateTopicContext &&
        debateTopicContext.trim() !== ""
      ) {
        const topicLine = debateTopicContext.trim();
        promptValue = `**TEMATICA CENTRAL de este debate (OBLIGATORIO usar solo esta):** ${topicLine.replace(
          /^Tema del debate \(TEMATICA CENTRAL\):\s*/i,
          ""
        )}\n\n${promptValue}`;
      }

      const result = await aiService.moderateMessageWithPrompt(
        message,
        username,
        conversationHistory,
        promptValue,
        initialArgumentsContext,
        debateTopicContext
      );

      results.push({
        promptIndex: i,
        promptName: prompt.name,
        prompt: prompt.value,
        ...result,
      });
    }

    // Determine if we should respond based on any of the prompts
    const shouldRespond = results.some((result) => result.shouldRespond);

    console.log(`✅ AI analysis complete (${results.length} prompts)`);
    return { shouldRespond, results };
  } catch (error) {
    console.error("AI Moderation error:", error);
    return { shouldRespond: false, results: [] };
  }
}

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handler(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
    allowEIO3: true,
  });

  // Turn timer management functions
  function startTurnTimer(roomId) {
    console.log(`⏰ Starting turn timer for room ${roomId}`);

    // Clear existing timer if any
    clearTurnTimer(roomId);

    // Start new timer (60 seconds)
    const timer = setTimeout(() => {
      console.log(`⏰ Turn timer expired for room ${roomId}`);
      switchToNextTurn(roomId);
    }, 60000); // 1 minute = 60,000ms

    // Start countdown updates every second
    const countdownInterval = setInterval(() => {
      const timerInfo = turnTimers.get(roomId);
      if (timerInfo) {
        timerInfo.timeLeft--;

        // Emit countdown update to room
        io.to(roomId).emit("turn-time-update", {
          timeLeft: timerInfo.timeLeft,
          roomId: roomId,
        });

        if (timerInfo.timeLeft <= 0) {
          clearInterval(countdownInterval);
        }
      } else {
        clearInterval(countdownInterval);
      }
    }, 1000);

    // Store timer info (including the countdown interval)
    turnTimers.set(roomId, {
      timer: timer,
      countdownInterval: countdownInterval,
      timeLeft: 60,
      startTime: Date.now(),
    });
  }

  function clearTurnTimer(roomId) {
    const timerInfo = turnTimers.get(roomId);
    if (timerInfo) {
      clearTimeout(timerInfo.timer);
      if (timerInfo.countdownInterval) {
        clearInterval(timerInfo.countdownInterval);
      }
      turnTimers.delete(roomId);
      console.log(`⏰ Cleared turn timer for room ${roomId}`);
    }
  }

  function switchToNextTurn(roomId) {
    console.log(`🔄 Switching to next turn in room ${roomId}`);

    const roomData = roomParticipants.get(roomId);
    if (
      !roomData ||
      !roomData.participants ||
      roomData.participants.length === 0
    ) {
      console.log(
        `⚠️ Cannot switch turn - room ${roomId} not found or no participants`
      );
      return;
    }

    // Switch to next participant
    roomData.currentTurn =
      (roomData.currentTurn + 1) % roomData.participants.length;
    roomData.currentSpeaker =
      roomData.participants[roomData.currentTurn].username;

    console.log(
      `🔄 Turn switched to: ${roomData.currentSpeaker} in room ${roomId}`
    );

    // Emit turn update to room
    io.to(roomId).emit("room-updated", {
      participants: roomData.participants,
      currentTurn: roomData.currentTurn,
      currentSpeaker: roomData.currentSpeaker,
      conversationStarted: roomData.conversationStarted,
      debateStartTime: roomData.debateStartTime,
      debateEndTime: roomData.debateEndTime,
      participantScores: roomData.participantScores || {},
    });

    // Start timer for new turn
    startTurnTimer(roomId);

    // Emit turn timeout message
    const timeoutMessage = {
      id: `timeout-${Date.now()}`,
      message: `⏰ Tiempo agotado. Continúa ${roomData.currentSpeaker}`,
      username: "Moderador",
      timestamp: new Date().toISOString(),
      socketId: "ai-moderator",
      isAIModerator: true,
      isSanction: true,
      showInMainChat: true,
    };

    // Store timeout message
    const messages = messageStore.get(roomId) || [];
    messages.push(timeoutMessage);
    messageStore.set(roomId, messages);

    io.to(roomId).emit("receive-message", timeoutMessage);
  }

  io.on("connection", (socket) => {
    console.log("\n=== NEW SOCKET CONNECTION ===");
    console.log("🔌 New user connected:", {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Join a room
    socket.on("join-room", (data) => {
      const { roomId, username, debateConfig, initialArgument } = data;

      console.log("\n=== JOIN ROOM EVENT ===");
      console.log("Room ID:", roomId);
      console.log("Username:", username);
      console.log("Debate Config:", JSON.stringify(debateConfig, null, 2));
      console.log("Socket ID:", socket.id);

      // Check if room exists and has participants
      let roomData = roomParticipants.get(roomId) || {
        participants: [],
        currentTurn: 0,
        currentSpeaker: null,
        conversationStarted: false,
      };

      console.log("Current room data:", JSON.stringify(roomData, null, 2));
      console.log("Total rooms in memory:", roomParticipants.size);
      console.log("All room IDs:", Array.from(roomParticipants.keys()));
      console.log(
        "All room configs:",
        JSON.stringify(Object.fromEntries(roomConfigs), null, 2)
      );

      // Check if this socket is already in the room
      if (roomData.participants.some((p) => p.socketId === socket.id)) {
        console.log("Socket already in room, ignoring duplicate join");
        return;
      }

      // Check if username already exists in room
      if (roomData.participants.some((p) => p.username === username)) {
        console.log("Username already taken, rejecting join");
        socket.emit("username-taken", {
          message: "Username already taken in this room.",
        });
        return;
      }

      // Add participant to room (store initial argument / postura for AI context)
      const participant = {
        socketId: socket.id,
        username: username,
        initialArgument: initialArgument || undefined,
      };
      roomData.participants.push(participant);
      roomParticipants.set(roomId, roomData);

      // Store room config if this is the first participant
      if (roomData.participants.length === 1 && debateConfig) {
        console.log(
          "Storing room config for new room:",
          JSON.stringify(debateConfig, null, 2)
        );
        roomConfigs.set(roomId, debateConfig);
      }

      socket.join(roomId);
      console.log(`✅ User ${username} (${socket.id}) joined room ${roomId}`);
      console.log("🏠 Updated room data:", JSON.stringify(roomData, null, 2));
      console.log("🔌 Socket joined room:", {
        socketId: socket.id,
        roomId: roomId,
        username: username,
      });

      // Verify socket is actually in the room
      io.in(roomId)
        .fetchSockets()
        .then((roomSockets) => {
          console.log("🔍 Verification - Sockets in room after join:", {
            roomId: roomId,
            socketCount: roomSockets.length,
            socketIds: roomSockets.map((s) => s.id),
            newSocketInRoom: roomSockets.some((s) => s.id === socket.id),
          });
        });
      console.log(
        "Updated room configs:",
        JSON.stringify(Object.fromEntries(roomConfigs), null, 2)
      );

      // Send message history to the newly joined user
      if (messageStore.has(roomId)) {
        const messages = messageStore.get(roomId);
        console.log("Sending message history:", messages.length, "messages");
        socket.emit("message-history", messages);
      } else {
        console.log("No message history for room");
      }

      // Send room info to all participants
      const roomInfo = {
        participants: roomData.participants,
        currentTurn: roomData.currentTurn,
        currentSpeaker: roomData.currentSpeaker,
        conversationStarted: roomData.conversationStarted || false,
        debateStartTime: roomData.debateStartTime,
        debateEndTime: roomData.debateEndTime,
        participantScores: roomData.participantScores || {},
      };

      console.log("📤 Sending room info to all participants:", {
        roomId: roomId,
        participants: roomData.participants,
        participantCount: roomData.participants.length,
      });

      // Log which sockets are in this room
      io.in(roomId)
        .fetchSockets()
        .then((roomSockets) => {
          console.log("🔌 Sockets currently in room:", {
            roomId: roomId,
            socketCount: roomSockets.length,
            socketIds: roomSockets.map((s) => s.id),
          });
        });

      // Send debate config to the newly joined user if room already has config
      const existingConfig = roomConfigs.get(roomId);
      console.log(
        `Room ${roomId} existing config:`,
        JSON.stringify(existingConfig, null, 2)
      );
      if (existingConfig) {
        console.log(`Sending config to user ${username} (${socket.id})`);
        socket.emit("room-config", existingConfig);
      } else {
        console.log(
          `No config found for room ${roomId}, waiting for creator...`
        );
        // Send a signal that we're waiting for the room creator
        socket.emit("waiting-for-creator", {
          message: "Waiting for room creator to join...",
        });
      }

      console.log(
        "📢 Broadcasting room-updated to all participants in room:",
        roomId
      );
      io.to(roomId).emit("room-updated", roomInfo);

      console.log("👋 Notifying other participants about new user:", {
        newUser: username,
        socketId: socket.id,
        roomId: roomId,
      });
      socket
        .to(roomId)
        .emit("user-joined", { socketId: socket.id, username: username });

      console.log("=== END JOIN ROOM EVENT ===\n");
    });

    // --- Voice call (WebRTC mesh for 2 people): signaling only ---
    socket.on("voice-join", (data) => {
      const { roomId } = data;
      if (!roomId || !socket.rooms.has(roomId)) return;
      let set = roomVoiceParticipants.get(roomId);
      if (!set) {
        set = new Set();
        roomVoiceParticipants.set(roomId, set);
      }
      set.add(socket.id);
      const roomData = roomParticipants.get(roomId);
      const username =
        roomData?.participants?.find((p) => p.socketId === socket.id)
          ?.username || null;
      socket.to(roomId).emit("voice-participant-joined", {
        socketId: socket.id,
        username,
      });
      const othersInVoice = Array.from(set)
        .filter((id) => id !== socket.id)
        .map((id) => {
          const u =
            roomData?.participants?.find((p) => p.socketId === id)?.username ||
            null;
          return { socketId: id, username: u };
        });
      socket.emit("voice-participants", { participants: othersInVoice });
    });

    socket.on("voice-leave", (data) => {
      const { roomId } = data;
      const set = roomVoiceParticipants.get(roomId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) roomVoiceParticipants.delete(roomId);
      }
      socket.to(roomId).emit("voice-participant-left", { socketId: socket.id });
    });

    socket.on("voice-offer", (data) => {
      const { targetSocketId, sdp } = data;
      if (targetSocketId) {
        io.to(targetSocketId).emit("voice-offer", {
          fromSocketId: socket.id,
          sdp,
        });
      }
    });

    socket.on("voice-answer", (data) => {
      const { targetSocketId, sdp } = data;
      if (targetSocketId) {
        io.to(targetSocketId).emit("voice-answer", {
          fromSocketId: socket.id,
          sdp,
        });
      }
    });

    socket.on("voice-ice", (data) => {
      const { targetSocketId, candidate } = data;
      if (targetSocketId) {
        io.to(targetSocketId).emit("voice-ice", {
          fromSocketId: socket.id,
          candidate,
        });
      }
    });

    // Send message to room
    socket.on("send-message", async (data) => {
      console.log("\n=== MESSAGE RECEIVED ===");
      console.log("🔵 Server received send-message event:", {
        roomId: data.roomId,
        message: data.message,
        username: data.username,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      const roomData = roomParticipants.get(data.roomId);
      console.log("🏠 Room data for message processing:", {
        roomExists: !!roomData,
        participants: roomData?.participants?.length || 0,
        participantUsernames:
          roomData?.participants?.map((p) => p.username) || [],
        allParticipants: roomData?.participants || [],
      });

      // Validate that conversation has started
      if (!roomData || !roomData.conversationStarted) {
        console.log("❌ Conversation not started yet, rejecting message");
        socket.emit("message-error", {
          message:
            "La conversación aún no ha comenzado. Espera a que alguien inicie la conversación.",
        });
        return;
      }

      // Validate that it's the sender's turn
      if (roomData.currentSpeaker !== data.username) {
        console.log(
          `❌ Not sender's turn. Current speaker: ${roomData.currentSpeaker}, Sender: ${data.username}`
        );
        socket.emit("message-error", {
          message: `No es tu turno. Es el turno de ${roomData.currentSpeaker}.`,
        });
        return;
      }

      const messageData = {
        id: Date.now().toString(),
        message: data.message,
        username: data.username,
        timestamp: new Date().toISOString(),
        socketId: socket.id,
        isAIModerator: false,
      };

      console.log("📝 Created message data:", {
        id: messageData.id,
        message: messageData.message,
        username: messageData.username,
        socketId: messageData.socketId,
        timestamp: messageData.timestamp,
      });

      // Store message
      if (!messageStore.has(data.roomId)) {
        messageStore.set(data.roomId, []);
        console.log("🆕 Created new message store for room:", data.roomId);
      }
      const messages = messageStore.get(data.roomId);
      messages.push(messageData);

      // Keep only last 100 messages per room
      if (messages.length > 100) {
        messages.splice(0, messages.length - 100);
      }
      messageStore.set(data.roomId, messages);

      console.log(
        "💾 Stored message. Total messages in room:",
        messages.length
      );

      // Check which sockets will receive this message BEFORE broadcasting
      console.log("🔍 Checking which sockets will receive this message...");
      io.in(data.roomId)
        .fetchSockets()
        .then((roomSockets) => {
          console.log("🎯 Sockets that will receive this message:", {
            roomId: data.roomId,
            socketCount: roomSockets.length,
            socketIds: roomSockets.map((s) => s.id),
            senderSocketId: socket.id,
            socketDetails: roomSockets.map((s) => ({
              id: s.id,
              connected: s.connected,
              rooms: Array.from(s.rooms),
            })),
          });
        });

      // Broadcast original message to room
      console.log("📡 Broadcasting message to room:", {
        roomId: data.roomId,
        messageId: messageData.id,
        message: messageData.message,
        username: messageData.username,
        senderSocketId: socket.id,
      });

      io.to(data.roomId).emit("receive-message", messageData);
      console.log("✅ Message broadcasted successfully to room:", data.roomId);
      console.log("=== END MESSAGE BROADCAST ===\n");

      // Check for AI intervention
      if (roomData) {
        // Analyze message with AI
        const aiResult = await analyzeMessage(
          data.message,
          data.username,
          data.roomId
        );

        // Send every AI prompt response to clients (for full log). Main chat shows only sanctions; side panel shows all.
        // Only one sanction is applied (score/room-updated) per participant message: the first that deserves sanction.
        if (aiResult.results && aiResult.results.length > 0) {
          const baseId = Date.now();
          let sanctionApplied = false;
          let firstSanctionShownInMain = false;
          for (const result of aiResult.results) {
            if (!result.shouldRespond || !result.response) continue;
            const promptName =
              result.promptName || `Prompt ${result.promptIndex + 1}`;
            const deservesSanction = await aiService.shouldSanction(
              result.response
            );
            console.log("🤖 Deserves sanction:", deservesSanction);
            const showInMainChat =
              deservesSanction && !firstSanctionShownInMain;
            if (showInMainChat) firstSanctionShownInMain = true;
            const aiMessage = {
              id: `ai-${baseId}-${result.promptIndex}`,
              message: `[${promptName}]\n\n${result.response}`,
              username: "Moderador",
              timestamp: new Date().toISOString(),
              socketId: "ai-moderator",
              isAIModerator: true,
              isSanction: deservesSanction,
              showInMainChat: showInMainChat,
              reason: result.reason,
              promptIndex: result.promptIndex,
              promptName: promptName,
            };
            messages.push(aiMessage);
            messageStore.set(data.roomId, messages);
            io.to(data.roomId).emit("receive-message", aiMessage);
            if (deservesSanction) {
              console.log(
                `🤖 AI intervention (sanction) for prompt "${promptName}":`,
                result.response
              );
            }
            // Apply sanction score only once per participant message
            if (deservesSanction && !sanctionApplied) {
              sanctionApplied = true;
              try {
                const negativeScore = await aiService.extractNegativeScore(
                  result.response
                );
                if (negativeScore < 0) {
                  roomData.participantScores = roomData.participantScores || {};
                  const prev = roomData.participantScores[data.username] ?? 0;
                  roomData.participantScores[data.username] =
                    prev + negativeScore;
                  roomParticipants.set(data.roomId, roomData);
                  console.log(
                    `📉 Sanction score: ${
                      data.username
                    } ${negativeScore} (total: ${
                      roomData.participantScores[data.username]
                    })`
                  );
                  io.to(data.roomId).emit("room-updated", {
                    participants: roomData.participants,
                    currentTurn: roomData.currentTurn,
                    currentSpeaker: roomData.currentSpeaker,
                    conversationStarted: roomData.conversationStarted,
                    debateStartTime: roomData.debateStartTime,
                    debateEndTime: roomData.debateEndTime,
                    participantScores: roomData.participantScores,
                  });
                }
              } catch (err) {
                console.error("Extract negative score error:", err);
              }
            }
          }
        }

        // Puntos positivos: evaluate message and add score to sender
        const puntosPrompt =
          roomConfigs.get(data.roomId)?.promptPuntosPositivos ||
          DEFAULT_PROMPTS.promptPuntosPositivos ||
          "";
        if (
          roomData?.conversationStarted &&
          puntosPrompt.trim() !== "" &&
          aiService.isAvailable()
        ) {
          try {
            roomData.participantScores = roomData.participantScores || {};
            const conversationHistory = messageStore.get(data.roomId) || [];
            const debateConfig = roomConfigs.get(data.roomId);
            const debateTopicContext = debateConfig?.description?.trim()
              ? `Tema del debate (TEMATICA CENTRAL): ${debateConfig.description.trim()}`
              : "";
            let initialArgumentsContext = "";
            if (roomData.participants?.length) {
              const lines = roomData.participants
                .filter(
                  (p) => p.initialArgument && String(p.initialArgument).trim()
                )
                .map((p) => `${p.username}: ${p.initialArgument.trim()}`);
              if (lines.length) {
                initialArgumentsContext = `Initial positions / Posturas ante el debate:\n${lines.join(
                  "\n"
                )}`;
              }
            }
            const puntosResult = await aiService.moderateMessageWithPrompt(
              data.message,
              data.username,
              conversationHistory,
              puntosPrompt.trim(),
              initialArgumentsContext,
              debateTopicContext
            );
            if (puntosResult?.response) {
              const points = await aiService.extractPointsNumber(
                puntosResult.response
              );
              const prev = roomData.participantScores[data.username] ?? 0;
              roomData.participantScores[data.username] = prev + points;
              roomParticipants.set(data.roomId, roomData);
              console.log(
                `🌟 Puntos positivos: ${data.username} +${points} (total: ${
                  roomData.participantScores[data.username]
                })`
              );
              // Emit puntos positivos as moderator message for full log (isSanction: false → main chat hides it)
              const puntosMessageList = messageStore.get(data.roomId) || [];
              const puntosAiMessage = {
                id: `ai-puntos-${Date.now()}`,
                message: `[Puntos positivos]\n\n${puntosResult.response}`,
                username: "Moderador",
                timestamp: new Date().toISOString(),
                socketId: "ai-moderator",
                isAIModerator: true,
                isSanction: false,
                showInMainChat: false,
                promptName: "Puntos positivos",
              };
              puntosMessageList.push(puntosAiMessage);
              messageStore.set(data.roomId, puntosMessageList);
              io.to(data.roomId).emit("receive-message", puntosAiMessage);
              io.to(data.roomId).emit("room-updated", {
                participants: roomData.participants,
                currentTurn: roomData.currentTurn,
                currentSpeaker: roomData.currentSpeaker,
                conversationStarted: roomData.conversationStarted,
                debateStartTime: roomData.debateStartTime,
                debateEndTime: roomData.debateEndTime,
                participantScores: roomData.participantScores,
              });
            }
          } catch (err) {
            console.error("Puntos positivos evaluation error:", err);
          }
        }

        // Handle turn switching and timer management (only if conversation has started)
        if (
          roomData &&
          roomData.participants &&
          roomData.participants.length > 0 &&
          roomData.conversationStarted
        ) {
          // Clear current turn timer
          clearTurnTimer(data.roomId);

          // Switch to next participant
          roomData.currentTurn =
            (roomData.currentTurn + 1) % roomData.participants.length;
          roomData.currentSpeaker =
            roomData.participants[roomData.currentTurn].username;
          roomParticipants.set(data.roomId, roomData);

          console.log(
            `🔄 Turn switched to: ${roomData.currentSpeaker} in room ${data.roomId}`
          );

          // Start timer for new turn
          startTurnTimer(data.roomId);

          // Emit turn update to room
          io.to(data.roomId).emit("room-updated", {
            participants: roomData.participants,
            currentTurn: roomData.currentTurn,
            currentSpeaker: roomData.currentSpeaker,
            conversationStarted: roomData.conversationStarted,
            debateStartTime: roomData.debateStartTime,
            debateEndTime: roomData.debateEndTime,
            participantScores: roomData.participantScores || {},
          });
        }
      }
    });

    // Handle start conversation
    socket.on("start-conversation", (data) => {
      console.log("\n=== START CONVERSATION EVENT ===");
      console.log("🚀 Start conversation:", {
        roomId: data.roomId,
        username: data.username,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      const roomData = roomParticipants.get(data.roomId);
      if (!roomData) {
        console.log("❌ Room not found:", data.roomId);
        socket.emit("conversation-start-error", {
          message: "Room not found.",
        });
        return;
      }

      if (roomData.conversationStarted) {
        console.log("⚠️ Conversation already started for room:", data.roomId);
        socket.emit("conversation-start-error", {
          message: "Conversation has already started.",
        });
        return;
      }

      if (!roomData.participants || roomData.participants.length === 0) {
        console.log("❌ No participants in room:", data.roomId);
        socket.emit("conversation-start-error", {
          message: "No participants in room.",
        });
        return;
      }

      // Start the conversation and set debate duration
      roomData.conversationStarted = true;
      roomData.currentTurn = 0;
      roomData.currentSpeaker = roomData.participants[0].username;
      const debateConfig = roomConfigs.get(data.roomId);
      const durationMinutes =
        parseInt(debateConfig?.duration || "30", 10) || 30;
      roomData.debateStartTime = Date.now();
      roomData.debateEndTime =
        durationMinutes === 0 ? null : Date.now() + durationMinutes * 60 * 1000;
      roomData.participantScores = {};
      roomData.participants.forEach((p) => {
        roomData.participantScores[p.username] = 0;
      });
      roomParticipants.set(data.roomId, roomData);

      console.log(
        `✅ Conversation started - first speaker: ${
          roomData.currentSpeaker
        }, duration: ${
          durationMinutes === 0 ? "unlimited" : durationMinutes + " min"
        }`
      );

      // Start timer for first participant
      startTurnTimer(data.roomId);

      // Emit room update to all participants (include debate times and scores)
      const roomInfo = {
        participants: roomData.participants,
        currentTurn: roomData.currentTurn,
        currentSpeaker: roomData.currentSpeaker,
        conversationStarted: roomData.conversationStarted,
        debateStartTime: roomData.debateStartTime,
        debateEndTime: roomData.debateEndTime,
        participantScores: roomData.participantScores || {},
      };

      io.to(data.roomId).emit("room-updated", roomInfo);
      console.log("📢 Room updated - conversation started");
      console.log("=== END START CONVERSATION EVENT ===\n");
    });

    // Extend debate duration (called when 5 min left)
    socket.on("extend-debate", (data) => {
      const { roomId, additionalMinutes } = data;
      const roomData = roomParticipants.get(roomId);
      if (!roomData || !roomData.conversationStarted) return;
      roomData.debateEndTime =
        additionalMinutes === 0
          ? null
          : Date.now() + additionalMinutes * 60 * 1000;
      roomParticipants.set(roomId, roomData);
      const roomInfo = {
        participants: roomData.participants,
        currentTurn: roomData.currentTurn,
        currentSpeaker: roomData.currentSpeaker,
        conversationStarted: roomData.conversationStarted,
        debateStartTime: roomData.debateStartTime,
        debateEndTime: roomData.debateEndTime,
        participantScores: roomData.participantScores || {},
      };
      io.to(roomId).emit("room-updated", roomInfo);
      console.log(
        `📢 Debate extended in ${roomId}: ${
          additionalMinutes === 0 ? "Sin límite" : additionalMinutes + " min"
        }`
      );
    });

    // Handle mocion submission
    socket.on("submit-mocion", async (data) => {
      console.log("\n=== MOCION SUBMISSION RECEIVED ===");
      console.log("📝 Mocion:", {
        roomId: data.roomId,
        username: data.username,
        moderatorMessage: data.moderatorMessage,
        mocionMessage: data.mocionMessage,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      try {
        const roomData = roomParticipants.get(data.roomId);
        if (!roomData) {
          console.log("❌ Room not found:", data.roomId);
          return;
        }

        const debateConfig = roomConfigs.get(data.roomId);
        const mocionPromptTemplate =
          debateConfig?.mocionPrompt || DEFAULT_PROMPTS.promptMocion || "";
        if (!mocionPromptTemplate.trim()) {
          console.log(
            "❌ No mocion prompt available (no debateConfig.mocionPrompt and no DEFAULT_PROMPTS.promptMocion)"
          );
          return;
        }

        const messages = messageStore.get(data.roomId) || [];

        // Post the mocion message to the chat
        const mocionUserMessage = {
          id: `mocion-${Date.now()}`,
          message: `[Moción] ${data.mocionMessage}`,
          username: data.username,
          timestamp: new Date().toISOString(),
          socketId: socket.id,
        };

        messages.push(mocionUserMessage);
        messageStore.set(data.roomId, messages);

        console.log("📡 Broadcasting mocion message to room:", {
          roomId: data.roomId,
          messageId: mocionUserMessage.id,
        });
        io.to(data.roomId).emit("receive-message", mocionUserMessage);
        console.log("✅ Mocion message broadcasted successfully");

        if (!aiService.isAvailable()) {
          console.log("❌ AI Service not available - no OpenAI API key");
          return;
        }

        // Build user prompt with [Veredicto Original] = moderator message, [Argumento de Apelación] = mocion
        const recentContext =
          messages.length > 0
            ? "\n[Contexto Previo]\n" +
              messages
                .slice(-6)
                .map((m) => `${m.username}: ${m.message}`)
                .join("\n")
            : "";
        const mocionUserPrompt = `[Veredicto Original / Mensaje del moderador sancionatorio]\n${data.moderatorMessage}\n\n[Argumento de Apelación]\n${data.mocionMessage}\n\nParticipante: ${data.username}${recentContext}`;

        console.log(
          "🤖 Calling AI with mocion prompt (template from config or default)"
        );
        const aiResponse = await aiService.callAI(
          mocionPromptTemplate,
          mocionUserPrompt
        );

        console.log("🤖 AI Response for mocion:", {
          responseLength: aiResponse?.length || 0,
          responsePreview: aiResponse?.substring(0, 150) + "...",
        });

        const resolutionText =
          (aiResponse && aiResponse.trim()) || "No se pudo procesar la moción.";

        const aiMocionMessage = {
          id: `mocion-ai-${Date.now()}`,
          message: resolutionText,
          username: "Moderador",
          timestamp: new Date().toISOString(),
          socketId: "ai-moderator",
          isAIModerator: true,
          isSanction: true,
          showInMainChat: true,
        };

        messages.push(aiMocionMessage);
        messageStore.set(data.roomId, messages);

        io.to(data.roomId).emit("receive-message", aiMocionMessage);
        console.log("✅ AI mocion response broadcasted successfully");

        // Evaluate resolution: use promptPuntosPositivos to score the resolution; high score + ACEPTADA → revert negative points
        const puntosPrompt =
          debateConfig?.promptPuntosPositivos ||
          DEFAULT_PROMPTS.promptPuntosPositivos ||
          "";
        let shouldRevertNegative = false;
        const upperResolution = (resolutionText || "").toUpperCase();
        const resolutionAccepts =
          upperResolution.includes("ACEPTADA") &&
          !upperResolution.includes("RECHAZADA");

        if (puntosPrompt.trim() && aiResponse?.trim()) {
          try {
            const conversationHistory = messageStore.get(data.roomId) || [];
            const debateTopicContext = debateConfig?.description?.trim()
              ? `Tema del debate: ${debateConfig.description.trim()}`
              : "";
            let initialArgumentsContext = "";
            if (roomData.participants?.length) {
              const lines = roomData.participants
                .filter(
                  (p) => p.initialArgument && String(p.initialArgument).trim()
                )
                .map((p) => `${p.username}: ${p.initialArgument.trim()}`);
              if (lines.length) {
                initialArgumentsContext = `Posturas: ${lines.join("\n")}`;
              }
            }
            const puntosResult = await aiService.moderateMessageWithPrompt(
              resolutionText.substring(0, 2000),
              data.username,
              conversationHistory.slice(-8),
              puntosPrompt.trim(),
              initialArgumentsContext,
              debateTopicContext
            );
            const resolutionScore =
              puntosResult?.response != null
                ? await aiService.extractPointsNumber(puntosResult.response)
                : 0;
            // Revert if resolution says ACEPTADA and the resolution scores well (merit to accept appeal)
            shouldRevertNegative = resolutionAccepts && resolutionScore >= 1.5;
            console.log(
              "🤖 Mocion promptPuntosPositivos score:",
              resolutionScore,
              "resolutionAccepts:",
              resolutionAccepts,
              "→ shouldRevertNegative:",
              shouldRevertNegative
            );
          } catch (err) {
            console.error(
              "Mocion promptPuntosPositivos evaluation error:",
              err
            );
            shouldRevertNegative = resolutionAccepts;
          }
        } else {
          shouldRevertNegative = resolutionAccepts;
          console.log(
            "🤖 Mocion fallback (no puntos prompt) → shouldRevertNegative:",
            shouldRevertNegative
          );
        }

        if (shouldRevertNegative) {
          const negativeScore = await aiService.extractNegativeScore(
            data.moderatorMessage
          );
          if (negativeScore < 0) {
            roomData.participantScores = roomData.participantScores || {};
            const prev = roomData.participantScores[data.username] ?? 0;
            roomData.participantScores[data.username] =
              prev + Math.abs(negativeScore);
            roomParticipants.set(data.roomId, roomData);
            console.log(
              `🔄 Reverted sanction: ${data.username} +${Math.abs(
                negativeScore
              )} (total: ${roomData.participantScores[data.username]})`
            );
            io.to(data.roomId).emit("room-updated", {
              participants: roomData.participants,
              currentTurn: roomData.currentTurn,
              currentSpeaker: roomData.currentSpeaker,
              conversationStarted: roomData.conversationStarted,
              debateStartTime: roomData.debateStartTime,
              debateEndTime: roomData.debateEndTime,
              participantScores: roomData.participantScores,
            });
          }
        }

        console.log("=== END MOCION SUBMISSION ===\n");
      } catch (error) {
        console.error("❌ Mocion submission error:", error);
        console.error("❌ Error details:", {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });
        console.log("=== END MOCION SUBMISSION (ERROR) ===\n");
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log("\n=== DISCONNECT EVENT ===");
      console.log("🔌 User disconnected:", {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      // Leave voice in any room
      for (const [roomId, set] of roomVoiceParticipants.entries()) {
        if (set.has(socket.id)) {
          set.delete(socket.id);
          if (set.size === 0) roomVoiceParticipants.delete(roomId);
          io.to(roomId).emit("voice-participant-left", { socketId: socket.id });
        }
      }

      // Check which rooms this socket was in
      const socketRooms = Array.from(socket.rooms);
      console.log("🏠 Socket was in rooms:", socketRooms);

      console.log(
        "Current rooms before disconnect:",
        JSON.stringify(Object.fromEntries(roomParticipants), null, 2)
      );
      console.log(
        "Current configs before disconnect:",
        JSON.stringify(Object.fromEntries(roomConfigs), null, 2)
      );

      // Remove participant from all rooms
      for (const [roomId, roomData] of roomParticipants.entries()) {
        const participantIndex = roomData.participants.findIndex(
          (p) => p.socketId === socket.id
        );
        if (participantIndex !== -1) {
          const participant = roomData.participants[participantIndex];
          console.log(
            `Removing participant ${participant.username} from room ${roomId}`
          );

          roomData.participants.splice(participantIndex, 1);

          roomParticipants.set(roomId, roomData);

          // Notify remaining participants (or keep room data for rejoin on refresh)
          if (roomData.participants.length > 0) {
            console.log(
              `Room ${roomId} still has ${roomData.participants.length} participants`
            );
            const roomInfo = {
              participants: roomData.participants,
              currentTurn: roomData.currentTurn,
              currentSpeaker: roomData.currentSpeaker,
              conversationStarted: roomData.conversationStarted,
              debateStartTime: roomData.debateStartTime,
              debateEndTime: roomData.debateEndTime,
              participantScores: roomData.participantScores || {},
            };
            io.to(roomId).emit("room-updated", roomInfo);
            io.to(roomId).emit("user-left", { username: participant.username });
          } else {
            // Keep room and config so that on refresh the user can rejoin and recover participantScores, conversation state, etc.
            console.log(
              `Room ${roomId} is now empty; keeping room data for rejoin (refresh)`
            );
          }

          console.log(
            "Updated rooms after disconnect:",
            JSON.stringify(Object.fromEntries(roomParticipants), null, 2)
          );
          console.log(
            "Updated configs after disconnect:",
            JSON.stringify(Object.fromEntries(roomConfigs), null, 2)
          );
          break;
        }
      }
      console.log("=== END DISCONNECT EVENT ===\n");
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
