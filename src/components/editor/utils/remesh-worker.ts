import { RemeshComputation } from '@/wasm/remesh-computation'
import RemeshModule from '@/wasm/remesh.js'

declare const self: DedicatedWorkerGlobalScope

type RemeshOptions = {
  target_edge_length?: number
  min_edge_length?: number
  remeshDim?: 3 | 6 // 3 for isotropic, 6 for anisotropic
}

type IncomingMessage = {
  positions: Float32Array
  indices: Uint32Array | Uint16Array
  options?: RemeshOptions
}
type Outgoing = {
  positions: Float32Array
  indices: Uint32Array
  diagnostics?: any
  error?: string
}

// eslint-disable-next-line unicorn/prefer-add-event-listener
self.onmessage = async (event: MessageEvent<IncomingMessage>) => {
  const { positions, indices, options } = event.data

  const Module = await RemeshModule()

  const computation = new RemeshComputation(positions, indices, {
    targetNumPoints: positions.length / 3,
    remeshDim: options?.remeshDim || 3,
  })
  await computation.remesh(Module)
  const remeshedPositions = computation.getRemeshedVertices()
  const remeshedIndices = computation.getRemeshedIndices()
  console.log({ remeshedPositions, remeshedIndices })

  console.log('Worker: Message received from main script', {
    positions,
    indices,
    options,
  })

  const out: Outgoing = {
    positions: new Float32Array(remeshedPositions),
    indices: new Uint32Array(remeshedIndices),
  }
  self.postMessage(out)
}
