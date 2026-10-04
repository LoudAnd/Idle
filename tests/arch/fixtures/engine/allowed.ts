// Negative control: none of these is environment access.
// The word window in a comment, and document, Date and performance too.
declare const obj: { document: string; window: number; self: number; location: string };

export const windowIndex = 3;
export const doc = obj.document;
export const keys = { window: 1, Date: 2, performance: 3, self: 4 };
export const label = 'Date';
export const template = `window ${windowIndex} document`;
export type Shape = { document?: string; fetch: () => void; location: string };
export const random = obj.window;
export const fromSelf = obj.self + obj.location.length;
export const maths = Math.floor(1.5) + Math.log2(8) + Math.max(1, 2);
export const ratio = windowIndex / 2 / 3;
export const pattern = /window|Date|Math\.random/.test(label);
