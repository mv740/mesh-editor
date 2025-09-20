// TypeScript bindings for emscripten-generated code.  Automatically generated at compile time.
interface WasmModule {
  _file_system_changed_callback(): void;
}

export interface ClassHandle {
  isAliasOf(other: ClassHandle): boolean;
  delete(): void;
  deleteLater(): this;
  isDeleted(): boolean;
  // @ts-ignore - If targeting lower than ESNext, this symbol might not exist.
  [Symbol.dispose](): void;
  clone(): this;
}
export interface VectorDouble extends ClassHandle {
  push_back(_0: number): void;
  resize(_0: number, _1: number): void;
  size(): number;
  get(_0: number): number | undefined;
  set(_0: number, _1: number): boolean;
}

export interface VectorInt extends ClassHandle {
  push_back(_0: number): void;
  resize(_0: number, _1: number): void;
  size(): number;
  get(_0: number): number | undefined;
  set(_0: number, _1: number): boolean;
}

export type RemeshResult = {
  vertices: VectorDouble,
  indices: VectorInt
};

interface EmbindModule {
  VectorDouble: {
    new(): VectorDouble;
  };
  VectorInt: {
    new(): VectorInt;
  };
  remesh(_0: VectorDouble, _1: VectorInt, _2: number, _3: number, _4: number, _5: number): RemeshResult;
}

export type MainModule = WasmModule & EmbindModule;
export default function MainModuleFactory (options?: unknown): Promise<MainModule>;
