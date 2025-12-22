
import { GoogleGenAI } from "@google/genai";

/**
 * Refines rough notes into professional syllabus content using Gemini.
 * Uses the gemini-3-flash-preview model for high-efficiency text tasks.
 */
export const refineSyllabusContent = async (roughNotes: string, field: 'topics' | 'homework'): Promise<string> => {
  try {
    // Create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert curriculum designer. Refine the following rough notes into clear, professional, bulleted ${field} for a school weekly syllabus. Keep it concise but professional. Notes: ${roughNotes}`,
    });
    
    // Accessing .text as a property as per the latest SDK requirements.
    return response.text || roughNotes;
  } catch (error) {
    console.error("Gemini Error:", error);
    return roughNotes;
  }
};
