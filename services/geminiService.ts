
import { GoogleGenAI } from "@google/genai";

// Initialize GoogleGenAI lazily or safely
let ai: GoogleGenAI | null = null;

try {
  // process.env.API_KEY is replaced by Vite at build time
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
  } else {
    console.warn("Gemini API Key is missing. AI features will be disabled.");
  }
} catch (error) {
  console.error("Failed to initialize Gemini client:", error);
}

export const refineSyllabusContent = async (roughNotes: string, field: 'topics' | 'homework'): Promise<string> => {
  if (!ai) {
    console.warn("Gemini AI is not initialized. Returning original content.");
    return roughNotes;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert curriculum designer. Refine the following rough notes into clear, professional, bulleted ${field} for a school weekly syllabus. Keep it concise but professional. Notes: ${roughNotes}`,
    });
    
    return response.text || roughNotes;
  } catch (error) {
    console.error("Gemini Error:", error);
    return roughNotes;
  }
};
