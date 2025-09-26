# Team Chat Application

A real-time chat application built with Next.js and Socket.io that allows teams to communicate instantly with shareable room links.

## Features

- 🚀 **Real-time messaging** - Instant message delivery using Socket.io
- 🔗 **Shareable links** - Create rooms and share links with your team
- 💾 **Message history** - Messages are stored and retrieved when joining rooms
- 🎨 **Modern UI** - Clean, responsive design with Tailwind CSS
- 📱 **Mobile friendly** - Works on all devices
- 🔄 **Auto-reconnect** - Handles connection issues gracefully

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd chat-app
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Usage

1. **Create a room**: Enter your name and click "Create New Room"
2. **Share the link**: Copy the generated link and share it with your team
3. **Join a room**: Enter your name and the room ID, or use a shared link
4. **Start chatting**: Messages appear in real-time for all users in the room

## Deployment

### Environment Variables

Create a `.env.local` file in the root directory:

```bash
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com
PORT=3000
```

### Build for Production

```bash
npm run build
npm start
```

### Deploy to Vercel

1. Install Vercel CLI:

```bash
npm i -g vercel
```

2. Deploy:

```bash
vercel
```

### Deploy to Other Platforms

The app includes a custom server (`server.js`) that handles both Next.js and Socket.io. Make sure your hosting platform supports:

- Node.js
- WebSocket connections
- Custom server setup

## Project Structure

```
chat-app/
├── src/
│   ├── app/
│   │   └── page.tsx          # Main page component
│   ├── components/
│   │   ├── Chat.tsx          # Chat interface
│   │   ├── LandingPage.tsx   # Room creation/joining
│   │   └── Message.tsx       # Individual message component
│   ├── hooks/
│   │   └── useSocket.ts      # Socket.io client hook
│   └── lib/
│       └── messageStore.ts   # Message storage utilities
├── server.js                 # Custom server with Socket.io
└── package.json
```

## Technologies Used

- **Next.js 15** - React framework
- **Socket.io** - Real-time communication
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **date-fns** - Date formatting
- **UUID** - Unique room generation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions, please open an issue on GitHub.
