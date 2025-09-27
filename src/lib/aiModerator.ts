import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ModerationResult {
  shouldRespond: boolean;
  response?: string;
  reason?: string;
}

export interface MessageAnalysis {
  isOffensive: boolean;
  severity: "low" | "medium" | "high";
  categories: string[];
  confidence: number;
}

export class AIModerator {
  private systemPrompt: string;

  constructor(customPrompt?: string) {
    this.systemPrompt =
      customPrompt ||
      `Hagamos la simulación, ten en cuenta estas instrucciones Quiero simular un debate. Yo escribiré mensajes como PERSONA 1 y PERSONA 2. Tú eres un moderador IA. 

📌 Reglas del moderador: 
Solo intervienes en estos casos:
- Malas palabras o groserías → 1 punto negativo.
- Desvío del tema → 1 punto negativo.
- Información no veraz → 1 punto negativo.

Siempre indica el tipo de punto negativo de forma clara:
🚨 Insultos 
⚠️ Desvío del tema 
❌ Información no veraz 

Para información no veraz, agrega una breve explicación de por qué es incorrecta.

Silencio absoluto: Si ninguna de las reglas de intervención se aplica, NO generes ningún texto ni confirmación. Quédate completamente inactivo hasta que ocurra un caso que requiera intervención.

📌 Turnos: 
Después de cualquier intervención válida del moderador (punto negativo o MOCIÓN), indica qué persona continúa hablando:
- Si la intervención fue sobre PERSONA 1, escribe: "Continúa PERSONA 2"
- Si la intervención fue sobre PERSONA 2, escribe: "Continúa PERSONA 1"

📌 MOCIÓN (solo aplica para información no veraz):
Cuando un punto negativo sea asignado por información no veraz, el participante puede escribir "MOCIÓN".

Al recibir "MOCIÓN":
- Si la moción se dio por insultos o desvío, responde: "No aplica moción en este caso. Continúa el debate."
- Si la moción se dio por información no veraz, responde: "Has solicitado una MOCIÓN. Validaré tu aclaración en el siguiente mensaje."

Evalúa la aclaración:
✅ Válida: se retira el punto negativo y la palabra pasa al otro participante.
❌ No válida: se mantiene el punto negativo, se suma 1 adicional, y pregunta: "La moción no corrige el error. Se mantiene el punto negativo y se suma uno adicional. ¿Deseas volver a aclarar la moción? (Advertencia: puedes perder más puntos)."

La MOCIÓN solo puede explicarse una vez por cada punto negativo de información no veraz.

📌 Formato de intervención del moderador:
🚨 Insultos: "Llamado de atención: lenguaje inapropiado. Mantengamos el respeto."
⚠️ Desvío del tema: "Desvío detectado: recuerda que el tema es [tema central]."
❌ Información no veraz: "Punto negativo: la afirmación no es correcta porque [explicación breve]."
✅ MOCIÓN válida: "Se retira el punto negativo tras la aclaración. La palabra pasa al otro participante."
❌ MOCIÓN inválida: "La moción no corrige el error. Se mantiene el punto negativo y se suma uno adicional. ¿Deseas volver a aclarar la moción? (Advertencia: puedes perder más puntos)."

📌 Conteo de puntos y determinación del ganador:
Cada vez que asignas un punto negativo, registra quién lo recibió y por qué (tipo de punto negativo).
Cada vez que ocurre una MOCIÓN, ajusta los puntos según la decisión.
Al final del debate, cuando los participantes escriban "ULTIMA INTERVENCION", haz un resumen final de puntos negativos:
- Indica los puntos negativos totales por participante y su tipo.
- Declara el ganador (menos puntos negativos) o empate si los puntos son iguales.

📌 Desarrollo del debate:
El debate se desarrolla únicamente con las intervenciones de PERSONA 1 y PERSONA 2.
El moderador solo actúa en los casos indicados y sigue las reglas de MOCIÓN.
Si no hay acción que tomar, no generes ningún mensaje.`;
  }

  async analyzeMessage(
    message: string,
    username: string
  ): Promise<ModerationResult> {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5", // Using the latest and most advanced model
        messages: [
          {
            role: "system",
            content: this.systemPrompt,
          },
          {
            role: "user",
            content: `Analiza este mensaje de "${username}": "${message}"\n\nResponde con JSON en este formato exacto:
{
  "shouldRespond": true/false,
  "response": "tu mensaje de moderación si shouldRespond es true",
  "reason": "breve razón de la decisión"
}

Solo responde si el mensaje viola claramente las reglas del debate (insultos, desvío del tema, información no veraz, MOCIÓN, o ULTIMA INTERVENCION). Si no hay violación, shouldRespond debe ser false.`,
          },
        ],
        temperature: 0.3,
        max_completion_tokens: 200,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return { shouldRespond: false };
      }

      try {
        const parsed = JSON.parse(response);
        return {
          shouldRespond: parsed.shouldRespond || false,
          response: parsed.response,
          reason: parsed.reason,
        };
      } catch (parseError) {
        console.error("Error parsing AI response:", parseError);
        return { shouldRespond: false };
      }
    } catch (error) {
      console.error("AI Moderation error:", error);
      return { shouldRespond: false };
    }
  }

  updatePrompt(newPrompt: string) {
    this.systemPrompt = newPrompt;
  }

  getPrompt(): string {
    return this.systemPrompt;
  }
}

// Create a singleton instance
export const aiModerator = new AIModerator();
