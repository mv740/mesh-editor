import {
  Box3,
  BufferAttribute,
  Float32BufferAttribute,
  Vector3,
  type BufferGeometry,
} from 'three'

export interface ComputeConsistentNormalsOptions {
  /**
   * Vertex merge tolerance (in world units). If <= 0 merging is skipped.
   * Default: 1e-4
   */
  tolerance?: number
  /**
   * If true, after computing normals the routine will try to ensure normals point outward
   * from the mesh center (based on bounding box center) and flip face winding if necessary.
   * Default: false
   */
  flipIfInward?: boolean
}

/**
 * Make triangle winding consistent, optionally merge near-duplicate vertices,
 * compute area-weighted per-vertex normals, and optionally flip if they point inward.
 *
 * Modifies the passed BufferGeometry in-place and returns it.
 *
 * Notes:
 * - If your model intentionally uses duplicated vertices for UV seams / hard edges,
 *   set tolerance <= 0 to skip the automatic merge.
 * - This assumes triangle faces (index length % 3 === 0). Non-triangular geometry will throw.
 */
export function computeConsistentNormals(
  geometry: BufferGeometry,
  options: ComputeConsistentNormalsOptions = {},
): BufferGeometry {
  const tol = options.tolerance === undefined ? 1e-4 : options.tolerance
  const flipIfInward = !!options.flipIfInward

  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    throw new Error(
      'geometry must be a THREE.BufferGeometry with a position attribute',
    )
  }

  // Helper typed accessors
  const oldPosArray = geometry.attributes.position.array as ArrayLike<number>
  const oldVertexCount = oldPosArray.length / 3

  // 1) Optionally merge near-duplicate vertices (quantize by tolerance)
  let uniquePositions: number[] = []
  let oldToNew: Uint32Array = new Uint32Array(oldVertexCount)
  let uniqueCount = oldVertexCount

  if (tol > 0) {
    const vertexMap = new Map<string, number>()
    uniquePositions = []
    oldToNew = new Uint32Array(oldVertexCount)
    uniqueCount = 0

    for (let i = 0; i < oldVertexCount; i++) {
      const x = oldPosArray[i * 3]
      const y = oldPosArray[i * 3 + 1]
      const z = oldPosArray[i * 3 + 2]
      const key = `${Math.round(x / tol)}_${Math.round(y / tol)}_${Math.round(z / tol)}`
      const existing = vertexMap.get(key)
      if (existing !== undefined) {
        oldToNew[i] = existing
      } else {
        vertexMap.set(key, uniqueCount)
        oldToNew[i] = uniqueCount
        uniquePositions.push(x, y, z)
        uniqueCount++
      }
    }
  } else {
    // No merge: mapping is identity
    uniqueCount = oldVertexCount
    uniquePositions = Array.prototype.slice.call(oldPosArray) as number[]
    oldToNew = new Uint32Array(oldVertexCount)
    for (let i = 0; i < oldVertexCount; i++) oldToNew[i] = i
  }

  // Build new index array (remap old indices -> new)
  const oldIndexAttr = geometry.index ? geometry.index.array : null
  let newIndexArray: Uint32Array
  if (oldIndexAttr) {
    newIndexArray = new Uint32Array(oldIndexAttr.length)
    for (const [i, element] of oldIndexAttr.entries()) {
      newIndexArray[i] = oldToNew[element]
    }
  } else {
    // non-indexed geometry: assume triangles stored sequentially
    if (oldVertexCount % 3 !== 0) {
      throw new Error(
        'Non-indexed geometry vertex count is not a multiple of 3',
      )
    }
    const triCount = oldVertexCount / 3
    newIndexArray = new Uint32Array(triCount * 3)
    for (let t = 0; t < triCount; t++) {
      newIndexArray[t * 3] = oldToNew[t * 3]
      newIndexArray[t * 3 + 1] = oldToNew[t * 3 + 1]
      newIndexArray[t * 3 + 2] = oldToNew[t * 3 + 2]
    }
  }

  // Replace geometry positions & index with merged ones
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(uniquePositions, 3),
  )
  geometry.setIndex(new BufferAttribute(newIndexArray, 1))

  // 2) Build face list and edge adjacency
  const idx = geometry.index!.array
  if (idx.length % 3 !== 0)
    throw new Error('index length is not a multiple of 3')

  const faceCount = idx.length / 3
  const faces: Array<[number, number, number]> = Array.from({
    length: faceCount,
  })
  for (let f = 0; f < faceCount; f++) {
    faces[f] = [idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]]
  }

  type EdgeEntry = { face: number; v1: number; v2: number }
  const edgeMap = new Map<string, EdgeEntry[]>()
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)

  for (let f = 0; f < faceCount; f++) {
    const [a, b, c] = faces[f]
    const edges: [number, number][] = [
      [a, b],
      [b, c],
      [c, a],
    ]
    for (const e of edges) {
      const key = edgeKey(e[0], e[1])
      const arr = edgeMap.get(key)
      if (arr) arr.push({ face: f, v1: e[0], v2: e[1] })
      else edgeMap.set(key, [{ face: f, v1: e[0], v2: e[1] }])
    }
  }

  // 3) Propagate orientation via BFS so shared edges have opposite traversal
  const visited = new Uint8Array(faceCount)
  const queue: number[] = []
  for (let start = 0; start < faceCount; start++) {
    if (visited[start]) continue
    visited[start] = 1
    queue.push(start)
    while (queue.length) {
      const f = queue.shift()!
      const [a, b, c] = faces[f]
      const fEdges = [
        { v1: a, v2: b },
        { v1: b, v2: c },
        { v1: c, v2: a },
      ]
      for (const fe of fEdges) {
        const key = edgeKey(fe.v1, fe.v2)
        const entries = edgeMap.get(key)
        if (!entries) continue
        for (const ent of entries) {
          const otherFace = ent.face
          if (otherFace === f) continue
          if (visited[otherFace]) continue
          const sameDirection = fe.v1 === ent.v1 && fe.v2 === ent.v2
          if (sameDirection) {
            // flip other face by swapping its 2nd and 3rd vertex
            const of = faces[otherFace]
            const tmp = of[1]
            of[1] = of[2]
            of[2] = tmp
          }
          visited[otherFace] = 1
          queue.push(otherFace)
        }
      }
    }
  }

  // write faces back to index buffer
  // ensure index array is a modifiable typed array (not shared read-only)
  const idxBuffer = new Uint32Array(idx.length)
  for (let f = 0; f < faceCount; f++) {
    idxBuffer[f * 3] = faces[f][0]
    idxBuffer[f * 3 + 1] = faces[f][1]
    idxBuffer[f * 3 + 2] = faces[f][2]
  }
  geometry.setIndex(new BufferAttribute(idxBuffer, 1))

  // 4) Compute face normals and accumulate to vertex normals (area-weighted)
  const vertexNormals = new Float32Array(uniqueCount * 3)

  const tmpA = new Vector3()
  const tmpB = new Vector3()
  const tmpC = new Vector3()
  const edge1 = new Vector3()
  const edge2 = new Vector3()
  const faceNormal = new Vector3()

  const idxArr = geometry.index!.array as ArrayLike<number>
  const posArr = geometry.attributes.position.array as ArrayLike<number>

  for (let f = 0; f < faceCount; f++) {
    const ia = idxArr[f * 3]
    const ib = idxArr[f * 3 + 1]
    const ic = idxArr[f * 3 + 2]

    tmpA.fromArray(posArr as number[], ia * 3)
    tmpB.fromArray(posArr as number[], ib * 3)
    tmpC.fromArray(posArr as number[], ic * 3)

    edge1.subVectors(tmpB, tmpA)
    edge2.subVectors(tmpC, tmpA)
    faceNormal.crossVectors(edge1, edge2) // unnormalized; magnitude ~ 2*area

    vertexNormals[ia * 3] += faceNormal.x
    vertexNormals[ia * 3 + 1] += faceNormal.y
    vertexNormals[ia * 3 + 2] += faceNormal.z

    vertexNormals[ib * 3] += faceNormal.x
    vertexNormals[ib * 3 + 1] += faceNormal.y
    vertexNormals[ib * 3 + 2] += faceNormal.z

    vertexNormals[ic * 3] += faceNormal.x
    vertexNormals[ic * 3 + 1] += faceNormal.y
    vertexNormals[ic * 3 + 2] += faceNormal.z
  }

  // normalize vertex normals and count zero-length normals
  let zeroNormalCount = 0
  for (let i = 0; i < uniqueCount; i++) {
    const nx = vertexNormals[i * 3]
    const ny = vertexNormals[i * 3 + 1]
    const nz = vertexNormals[i * 3 + 2]
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) {
      // Assign a deterministic fallback normal to avoid all-zero normals
      vertexNormals[i * 3] = 0
      vertexNormals[i * 3 + 1] = 0
      vertexNormals[i * 3 + 2] = 1
      zeroNormalCount++
    } else {
      vertexNormals[i * 3] = nx / len
      vertexNormals[i * 3 + 1] = ny / len
      vertexNormals[i * 3 + 2] = nz / len
    }
  }

  geometry.setAttribute('normal', new Float32BufferAttribute(vertexNormals, 3))
  if (zeroNormalCount > 0) {
    console.warn(
      `[computeConsistentNormals] ${zeroNormalCount} vertices had zero-length normals; a fallback normal was assigned.`,
    )
  }

  // 5) Optionally ensure normals point outward (flip all faces + invert normals if needed)
  if (flipIfInward) {
    geometry.computeBoundingBox()
    const bb = geometry.boundingBox ?? new Box3()
    const center = new Vector3()
    bb.getCenter(center)

    // reuse centroid to avoid per-face allocation
    const centroid = new Vector3()

    let totalDot = 0
    for (let f = 0; f < faceCount; f++) {
      const ia = idxArr[f * 3]
      const ib = idxArr[f * 3 + 1]
      const ic = idxArr[f * 3 + 2]
      tmpA.fromArray(posArr as number[], ia * 3)
      tmpB.fromArray(posArr as number[], ib * 3)
      tmpC.fromArray(posArr as number[], ic * 3)
      centroid
        .addVectors(tmpA, tmpB)
        .add(tmpC)
        .multiplyScalar(1 / 3)
      edge1.subVectors(tmpB, tmpA)
      edge2.subVectors(tmpC, tmpA)
      faceNormal.crossVectors(edge1, edge2).normalize()
      const d = centroid.sub(center).dot(faceNormal)
      totalDot += d
    }
    const avgDot = totalDot / faceCount
    if (avgDot < 0) {
      // flip all face windings and invert normals
      const newIdx = geometry.index!.array as Uint32Array
      for (let f = 0; f < faceCount; f++) {
        const off = f * 3
        const tmp = newIdx[off + 1]
        newIdx[off + 1] = newIdx[off + 2]
        newIdx[off + 2] = tmp
      }
      geometry.index!.needsUpdate = true

      const normals = geometry.attributes.normal.array as Float32Array
      for (let i = 0; i < normals.length; i++) normals[i] = -normals[i]
      geometry.attributes.normal.needsUpdate = true
    }
  }

  geometry.attributes.position.needsUpdate = true
  geometry.computeBoundingSphere()

  return geometry
}
