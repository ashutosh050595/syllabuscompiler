
import { GoogleGenAI } from "@google/genai";

// Fix: Initialize GoogleGenAI with named apiKey parameter and direct process.env reference
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const refineSyllabusContent = async (roughNotes: string, field: 'topics' | 'homework'): Promise<string> => {
  // Fix: Handle cases where API_KEY might be missing gracefully
  if (!process.env.API_KEY) return roughNotes;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert curriculum designer. Refine the following rough notes into clear, professional, bulleted ${field} for a school weekly syllabus. Keep it concise but professional. Notes: ${roughNotes}`,
    });
    
    // Fix: Access .text property directly as it is not a method
    return response.text || roughNotes;
  } catch (error) {
    console.error("Gemini Error:", error);
    return roughNotes;
  }
};
