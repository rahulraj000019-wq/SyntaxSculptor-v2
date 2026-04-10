import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

const model =
  process.env.GENKIT_MODEL ||
  process.env.GEMINI_MODEL ||
  // Default to a model we have already verified works with this plugin/API.
  'googleai/gemini-2.5-flash';

export const ai = genkit({
  plugins: [
    googleAI({
      // Support both common env var names.
      // - This project UI tells users to set GEMINI_API_KEY
      // - Genkit examples often use GOOGLE_GENAI_API_KEY
      apiKey:
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GENAI_API_KEY ||
        process.env.GOOGLE_API_KEY,
    }),
  ],
  model,
});
