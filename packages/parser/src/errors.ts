export interface ParseError {
  line: number;
  column: number;
  message: string;
  code?: string;
}
