# Ask Mo Anything - Islamic Knowledge AI Assistant

An AI-powered chatbot that provides information about Prophet Muhammad ﷺ (peace be upon him) and Islamic teachings, based on authentic sources including the Quran, Hadith, Sira (prophetic biography), and Tafsir (Quranic exegesis).

## Features

- Interactive chat interface
- Responses based on authentic Islamic sources
- Mobile-responsive design
- Clear disclaimers and ethical guidelines

## Important Notice

This AI assistant is designed to be:
1. Educational in nature
2. Based on authentic sources
3. Respectful of Islamic teachings and etiquette
4. A supplement to, not replacement for, proper Islamic scholarship

## Future Enhancements

To make this a production-ready application, the following enhancements would be needed:

1. Integration with a custom knowledge base containing:
   - Quran translations and interpretations
   - Authentic Hadith collections
   - Sira (Prophet's biography)
   - Reliable Tafsir (Quranic interpretations)

2. Advanced Natural Language Processing to:
   - Understand complex Islamic queries
   - Provide accurate, source-based responses
   - Handle multiple languages (Arabic, English, etc.)

3. Source citation system to:
   - Reference specific verses, hadith, or scholarly works
   - Provide links to authentic sources
   - Enable further reading and verification

4. Content verification system to:
   - Ensure accuracy of responses
   - Filter out inappropriate content
   - Maintain Islamic etiquette

## Ethical Considerations

When implementing the AI system, special attention should be paid to:
1. Accuracy of religious information
2. Proper respect for religious content
3. Clear disclaimers about AI limitations
4. Guidance to seek qualified scholars for serious inquiries
5. Protection against misuse or disrespect

## Technical Requirements

- Modern web browser
- Node.js and npm installed
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
