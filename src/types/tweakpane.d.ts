// Tweakpane 4.x ships broken published type declarations: its .d.ts files
// import from "@tweakpane/core", a scoped package that was never published
// for the v4 line (upstream packaging bug). The library itself works fine at
// runtime, so we hand-declare the minimal surface this project uses instead
// of downgrading or depending on a nonexistent types package.
declare module "tweakpane" {
  export interface PaneConfig {
    container?: HTMLElement;
    title?: string;
    expanded?: boolean;
  }

  export interface TpChangeEvent<T> {
    value: T;
  }

  export interface BindingApi<T = unknown> {
    on(eventName: "change", handler: (ev: TpChangeEvent<T>) => void): this;
    refresh(): void;
    dispose(): void;
  }

  export interface ButtonApi {
    on(eventName: "click", handler: () => void): this;
    dispose(): void;
  }

  export interface BindingParams {
    label?: string;
    min?: number;
    max?: number;
    step?: number;
    readonly?: boolean;
    interval?: number;
    [key: string]: unknown;
  }

  export interface ButtonParams {
    title?: string;
    label?: string;
  }

  export interface FolderParams {
    title: string;
    expanded?: boolean;
  }

  export class Pane {
    constructor(config?: PaneConfig);
    addBinding<O extends object, K extends keyof O>(
      object: O,
      key: K,
      params?: BindingParams,
    ): BindingApi<O[K]>;
    addButton(params: ButtonParams): ButtonApi;
    addFolder(params: FolderParams): Pane;
    refresh(): void;
    dispose(): void;
  }
}
