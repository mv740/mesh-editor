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
  /**
   * If > 0, split vertices across sharp edges where the angle between adjacent
   * face normals exceeds this threshold (in degrees). This duplicates vertices
   * along those seams so normals are not averaged across hard edges.
   * Default: 0 (no splitting)
   */
  splitAngleDeg?: number
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

  // 4) Compute face normals (unnormalized; magnitude ~ 2*area)
  const tmpA = new Vector3()
  const tmpB = new Vector3()
  const tmpC = new Vector3()
  const edge1 = new Vector3()
  const edge2 = new Vector3()
  const faceNormal = new Vector3()

  const idxArr = geometry.index!.array as ArrayLike<number>
  const posArr = geometry.attributes.position.array as ArrayLike<number>

  // store per-face normals
  // store per-face normals and detect degenerate (zero-area) faces
  const faceNormals: Vector3[] = Array.from(
    { length: faceCount },
    () => new Vector3(),
  )
  const degenerateFace = new Uint8Array(faceCount)
  let degenerateCount = 0
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
    const lenSq = faceNormal.lengthSq()
    if (lenSq <= 1e-18) {
      degenerateFace[f] = 1
      degenerateCount++
      faceNormals[f] = new Vector3(0, 0, 0)
    } else {
      faceNormals[f] = faceNormal.clone()
    }
  }
  if (degenerateCount > 0) {
    console.warn(
      `[computeConsistentNormals] ${degenerateCount} degenerate (zero-area) faces were detected and ignored.`,
    )
  }

  // If requested, split vertices across sharp edges by clustering incident
  // faces per-vertex according to face normal angle.
  const splitAngleDeg =
    options.splitAngleDeg === undefined ? 0 : options.splitAngleDeg
  let finalPositions = Array.prototype.slice.call(posArr) as number[]
  let finalIndexArray: Uint32Array = new Uint32Array(idxArr as any)

  if (splitAngleDeg > 0) {
    const cosThresh = Math.cos((splitAngleDeg * Math.PI) / 180)

    // build vertex -> incident faces map
    const vertexFaces: number[][] = Array.from(
      { length: uniqueCount },
      () => [],
    )
    for (let f = 0; f < faceCount; f++) {
      vertexFaces[idxArr[f * 3]].push(f)
      vertexFaces[idxArr[f * 3 + 1]].push(f)
      vertexFaces[idxArr[f * 3 + 2]].push(f)
    }

    // mapping: for each original vertex and face -> new vertex index
    const mapping: Array<Map<number, number>> = Array.from(
      { length: uniqueCount },
      () => new Map(),
    )

    // newPositions starts with existing unique positions
    const newPositions: number[] = finalPositions.slice()

    for (let v = 0; v < uniqueCount; v++) {
      const incident = vertexFaces[v]
      if (incident.length === 0) continue

      // groups: array of { repNormal: Vector3, faces: number[] }
      const groups: { rep: Vector3; faces: number[] }[] = []

      for (const f of incident) {
        const fn = faceNormals[f].clone().normalize()
        let assigned = false
        for (const g of groups) {
          // compare fn with group's representative normal (dot product)
          const dot = fn.dot(g.rep)
          if (dot >= cosThresh) {
            g.faces.push(f)
            // update representative as normalized sum
            g.rep.add(fn).normalize()
            assigned = true
            break
          }
        }
        if (!assigned) {
          groups.push({ rep: fn.clone(), faces: [f] })
        }
      }

      // For the first group reuse original vertex index v; for other groups create duplicates
      for (const [gi, g] of groups.entries()) {
        let newIdx: number
        if (gi === 0) {
          newIdx = v
        } else {
          // duplicate position
          const px = posArr[v * 3]
          const py = posArr[v * 3 + 1]
          const pz = posArr[v * 3 + 2]
          newIdx = newPositions.length / 3
          newPositions.push(px, py, pz)
        }
        for (const f of g.faces) mapping[v].set(f, newIdx)
      }
    }

    // rebuild index array using mapping
    const newIdxArr = new Uint32Array(idxArr.length)
    for (let f = 0; f < faceCount; f++) {
      for (let j = 0; j < 3; j++) {
        const oldV = idxArr[f * 3 + j]
        const mapped = mapping[oldV].get(f)
        if (mapped === undefined) {
          // fallback to original
          newIdxArr[f * 3 + j] = oldV
        } else {
          newIdxArr[f * 3 + j] = mapped
        }
      }
    }

    finalPositions = newPositions
    finalIndexArray = newIdxArr
  }

  // Now accumulate vertex normals from faceNormals using finalIndexArray and finalPositions
  // Remove unreferenced vertices (those not used by any triangle) so they
  // don't produce zero-length normals. This compacts positions and remaps
  // the index buffer.
  let finalVertexCount = finalPositions.length / 3
  if (finalIndexArray.length > 0) {
    const used = new Uint8Array(finalVertexCount)
    for (let i = 0; i < finalIndexArray.length; i++)
      used[finalIndexArray[i]] = 1

    // If some vertices are unused, compact
    let anyUnused = false
    for (let i = 0; i < finalVertexCount; i++)
      if (!used[i]) {
        anyUnused = true
        break
      }
    if (anyUnused) {
      const oldToNew = new Uint32Array(finalVertexCount)
      const newPositions: number[] = []
      let nextIdx = 0
      for (let v = 0; v < finalVertexCount; v++) {
        if (used[v]) {
          oldToNew[v] = nextIdx
          newPositions.push(
            finalPositions[v * 3],
            finalPositions[v * 3 + 1],
            finalPositions[v * 3 + 2],
          )
          nextIdx++
        }
      }
      const newIndexArray = new Uint32Array(finalIndexArray.length)
      for (let i = 0; i < finalIndexArray.length; i++)
        newIndexArray[i] = oldToNew[finalIndexArray[i]]
      finalPositions = newPositions
      finalIndexArray = newIndexArray
      finalVertexCount = finalPositions.length / 3
    }
  }
  const vertexNormals = new Float32Array(finalVertexCount * 3)
  for (let f = 0; f < faceCount; f++) {
    const fn = faceNormals[f]
    for (let j = 0; j < 3; j++) {
      const vid = finalIndexArray[f * 3 + j]
      vertexNormals[vid * 3] += fn.x
      vertexNormals[vid * 3 + 1] += fn.y
      vertexNormals[vid * 3 + 2] += fn.z
    }
  }

  // normalize vertex normals and assign fallback for zero-length
  let zeroNormalCount = 0
  for (let i = 0; i < finalVertexCount; i++) {
    const nx = vertexNormals[i * 3]
    const ny = vertexNormals[i * 3 + 1]
    const nz = vertexNormals[i * 3 + 2]
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) {
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

  // Write final positions & normals & index into geometry
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(finalPositions, 3),
  )
  geometry.setIndex(new BufferAttribute(finalIndexArray, 1))
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
