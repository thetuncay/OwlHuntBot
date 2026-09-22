import type { Client } from 'discord.js';

let clientRef: Client | null = null;

export function setDiscordClient(client: Client): void {
  clientRef = client;
}

export function getDiscordClient(): Client | null {
  return clientRef;
}
