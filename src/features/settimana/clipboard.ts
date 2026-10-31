/**
 * Copia negli appunti con ripiego: Clipboard API, poi selezione nascosta con execCommand.
 * Restituisce false se nessuno dei due funziona (es. anteprima in un iframe senza permessi):
 * in quel caso l'interfaccia mostra il testo da selezionare a mano.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* si prova il ripiego */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    // Su iOS la selezione funziona solo con un campo modificabile e un intervallo esplicito.
    ta.contentEditable = 'true';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
