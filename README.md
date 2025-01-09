# Ask Mo Anything - Islamic Knowledge AI Assistant

An AI-powered chatbot that provides information about Prophet Muhammad ﷺ (peace be upon him) and Islamic teachings, based on authentic sources including the Quran, Hadith, Sira (prophetic biography), and Tafsir (Quranic exegesis).

## Features

- 🤖 AI-powered responses based on authentic Islamic sources
- 🎯 Accurate citations from the Quran and Hadith
- 🌐 Support for both English and Arabic text
- ⚡ Real-time chat interface
- 🔒 Rate limiting for API protection
- 📱 Responsive design for all devices

## Important Notice

This application is designed to be an educational tool and should not be considered a replacement for:
- Proper Islamic scholarship
- Religious rulings (fatawa)
- Direct consultation with qualified Islamic scholars

Always verify information with authentic Islamic sources and scholars.

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- OpenAI API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/askmoanything.git
cd askmoanything
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

4. Add your OpenAI API key to the `.env` file:
```
OPENAI_API_KEY=your_api_key_here
```

## Running the Application

1. Start the development server:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

## Development

- The application uses Express.js for the backend server
- Frontend is built with vanilla JavaScript and modern CSS
- OpenAI's GPT-4 model is used for generating responses
- Rate limiting is implemented to prevent abuse

## Security Considerations

- Never expose your OpenAI API key
- Use environment variables for sensitive data
- Implement proper rate limiting in production
- Add authentication for production use

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.

## Disclaimer

This is an AI assistant and should be used as a learning tool only. Always verify information with authentic Islamic sources and consult qualified scholars for religious guidance.
