/**
 * Foto in attesa del foglio dei pasti (docs/FASE2.md § 7.1, § 7.7): restano solo in memoria, mai nello stato.
 *
 * - La foto scelta dal selettore del foglio della voce: il `<label>` la consegna qui al `change` e apre `mealLog`, che
 *   la prende all'apertura. Il pannello non porta la foto nei suoi parametri (sarebbero dati nell'URL e nello stato
 *   dell'interfaccia): la porta questa casella, che tiene solo l'ultima.
 * - Le foto da 1.024 px dei messaggi della chat, finché l'app è aperta: «Metti nel diario» usa quella se c'è, altrimenti
 *   la copia da 720 px conservata nel messaggio. Le tiene la chat quando invia una foto (`rememberChatPhoto`).
 */

/** Una foto scelta: il file del selettore oppure un data URL già pronto. */
export type PendingPhoto = { kind: 'file'; file: Blob } | { kind: 'dataUrl'; dataUrl: string };

let pending: { id: number; photo: PendingPhoto } | null = null;
let counter = 0;

/** Mette la foto scelta nella casella (sostituisce quella di prima) e restituisce il suo numero. */
export function stashPhoto(photo: PendingPhoto): number {
  counter += 1;
  pending = { id: counter, photo };
  return counter;
}

/** La foto in attesa, senza toglierla (il foglio la legge quando si monta). */
export function peekPhoto(): { id: number; photo: PendingPhoto } | null {
  return pending;
}

/** Svuota la casella, solo se contiene ancora la foto `id` (o comunque, senza id). */
export function clearPhoto(id?: number): void {
  if (!pending || id === undefined || pending.id === id) pending = null;
}

/** Foto da 1.024 px dei messaggi della chat, al massimo le ultime 4 (in memoria, si perdono alla chiusura dell'app). */
const CHAT_PHOTOS_MAX = 4;
const chatPhotos = new Map<string, string>();

export function rememberChatPhoto(messageId: string, dataUrl: string): void {
  if (!messageId || !dataUrl) return;
  chatPhotos.delete(messageId);
  chatPhotos.set(messageId, dataUrl);
  while (chatPhotos.size > CHAT_PHOTOS_MAX) {
    const oldest = chatPhotos.keys().next().value;
    if (oldest === undefined) break;
    chatPhotos.delete(oldest);
  }
}

/** La foto da 1.024 px di un messaggio, se è ancora in memoria. */
export function chatPhoto(messageId: string): string | undefined {
  return chatPhotos.get(messageId);
}
