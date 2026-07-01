// Stub for MVP — overlay labels/captions content (spec section 8) is deferred.
// Hidden by default; wires the container element for a later pass to populate.
export class ExplanationOverlay {
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.display = "none";
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? "block" : "none";
  }

  setText(text: string): void {
    this.container.textContent = text;
  }
}
