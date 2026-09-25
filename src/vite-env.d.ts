/// <reference types="vite/client" />

declare module "virtual:languages" {
  import type { CoreNode } from "./data/model";
  const nodes: (CoreNode & { folder: string })[];
  export default nodes;
}

declare module "virtual:language-details" {
  import type { NodeDetails } from "./data/model";
  const details: Record<string, NodeDetails>;
  export default details;
}
