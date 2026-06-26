export interface ModelGateway {
  complete(input: { prompt: string; model?: string; maxTurns?: number }): Promise<{ text: string; model: string; turns: number }>;
}

export class DisabledGateway implements ModelGateway {
  async complete(): Promise<{ text: string; model: string; turns: number }> {
    throw new Error("No model gateway configured");
  }
}
