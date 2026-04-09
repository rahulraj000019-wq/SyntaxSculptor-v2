'use server';
/**
 * @fileOverview This file implements a Genkit flow for generating AI-enhanced explanations for C language compiler errors.
 * It takes the source code and optionally pre-detected errors, then uses a large language model to provide
 * expert analysis of syntax, semantics, and common C pitfalls.
 *
 * - explainCompilerErrors - A function that triggers the AI error explanation process.
 * - AIErrorExplanationInput - The input type for the explainCompilerErrors function.
 * - AIErrorExplanationOutput - The return type for the explainCompilerErrors function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const CompilerErrorSchema = z.object({
  message: z.string().describe('The raw error message from the compiler.'),
  line: z.number().describe('The line number where the error occurred.'),
  type: z.enum(['Lexical', 'Syntax', 'Semantic', 'Header', 'Logic']).describe('The type of error.'),
});

const AIErrorExplanationInputSchema = z.object({
  sourceCode: z.string().describe('The full C source code provided by the user.'),
  compilerErrors: z.array(CompilerErrorSchema).optional().describe('A list of detected compiler errors, if any.'),
});

export type AIErrorExplanationInput = z.infer<typeof AIErrorExplanationInputSchema>;

const EnhancedErrorExplanationSchema = z.object({
  originalMessage: z.string().describe('A short title or description of the error.'),
  line: z.number().describe('The line number associated with the error.'),
  type: z.string().describe('The category of the error (e.g., Syntax, Pointer, Memory).'),
  explanation: z.string().describe('A clear, user-friendly explanation of the error.'),
  potentialCauses: z.array(z.string()).describe('A list of common reasons why this error might occur in C.'),
  suggestions: z.array(z.string()).describe('Actionable steps to fix the error with code examples.'),
});

const AIErrorExplanationOutputSchema = z.object({
  success: z.boolean().describe('Whether the code is valid C or not.'),
  enhancedErrors: z.array(EnhancedErrorExplanationSchema).describe('A list of detected errors and their explanations.'),
  overallFeedback: z.string().optional().describe('General feedback on the code quality or C standards (C89, C99, etc.).'),
  correctedCode: z.string().optional().describe('A fully corrected, working, and properly formatted version of the source code.'),
});

export type AIErrorExplanationOutput = z.infer<typeof AIErrorExplanationOutputSchema>;

export async function explainCompilerErrors(input: AIErrorExplanationInput): Promise<AIErrorExplanationOutput> {
  return aiErrorExplanationFlow(input);
}

const aiErrorExplanationPrompt = ai.definePrompt({
  name: 'aiErrorExplanationPrompt',
  input: { schema: AIErrorExplanationInputSchema },
  output: { schema: AIErrorExplanationOutputSchema },
  prompt: `You are an elite C language compiler and mentor. You support the full C standard (C89, C99, C11, C17, C23).
Your task is to analyze the provided C source code. Identify any syntax errors, semantic issues (type mismatches, uninitialized variables), memory management problems (leaks, buffer overflows), or logic flaws.

Source Code:
\`\`\`c
{{{sourceCode}}}
\`\`\`

{{#if compilerErrors}}
Preliminary Detected Issues:
{{#each compilerErrors}}
- Type: {{{type}}}, Line: {{{line}}}, Message: "{{{message}}}"
{{/each}}
{{/if}}

Perform a rigorous analysis. If the code is perfect, set "success" to true. If there are any issues, set "success" to false and provide detailed "enhancedErrors".

For each error:
- Explain precisely WHY the C standard rejects this or why it is dangerous.
- Reference specific line numbers and identifiers.
- Provide "potentialCauses" related to C concepts.
- Provide "suggestions" that show the user the corrected syntax.

CRITICAL: If there are errors (success: false), you MUST provide a full, corrected version of the code in the "correctedCode" field. This version should be properly indented, use idiomatic C patterns, and fix all identified issues.

Be pedantic but helpful.`,
});

const aiErrorExplanationFlow = ai.defineFlow(
  {
    name: 'aiErrorExplanationFlow',
    inputSchema: AIErrorExplanationInputSchema,
    outputSchema: AIErrorExplanationOutputSchema,
  },
  async (input) => {
    const { output } = await aiErrorExplanationPrompt(input);
    return output!;
  }
);
