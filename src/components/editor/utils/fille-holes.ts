import Constrainautor from '@kninnug/constrainautor'
import Delaunator from 'delaunator'
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Vector3,
  type ColorRepresentation,
} from 'three'
import { BufferGeometryUtils } from 'three/examples/jsm/Addons.js'

export type BoundaryResult = {
  boundaryEdges: [number, number][]
  logicalIndex: number[]
  logicalToPosition: Map<number, Vector3>
}

/**
 * Find boundary edges based only on vertex positions (ignores seams).
 */
export function findPositionBasedBoundaryEdges(
  geometry: BufferGeometry,
  tolerance: number = 1e-5,
): BoundaryResult {
  const posAttr = geometry.attributes.position as BufferAttribute
  const vertexMap = new Map<string, number>()
  const logicalToPosition = new Map<number, Vector3>()
  const logicalIndex: number[] = []
  let nextIndex = 0

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i)
    const y = posAttr.getY(i)
    const z = posAttr.getZ(i)
    const key = `${Math.round(x / tolerance)}_${Math.round(y / tolerance)}_${Math.round(z / tolerance)}`
    if (!vertexMap.has(key)) {
      vertexMap.set(key, nextIndex)
      logicalToPosition.set(nextIndex, new Vector3(x, y, z))
      nextIndex++
    }
    logicalIndex[i] = vertexMap.get(key)!
  }

  const indexArray = geometry.index
    ? (geometry.index.array as ArrayLike<number>)
    : Array.from({ length: posAttr.count }, (_, i) => i)

  const edgeCount = new Map<string, number>()
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)

  for (let i = 0; i < indexArray.length; i += 3) {
    const a = logicalIndex[indexArray[i]]
    const b = logicalIndex[indexArray[i + 1]]
    const c = logicalIndex[indexArray[i + 2]]

    ;[
      [a, b],
      [b, c],
      [c, a],
    ].forEach(([v1, v2]) => {
      const key = edgeKey(v1, v2)
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1)
    })
  }

  const boundaryEdges: [number, number][] = []
  for (const [key, count] of edgeCount.entries()) {
    if (count === 1) {
      const [v1, v2] = key.split('_').map(Number) as [number, number]
      boundaryEdges.push([v1, v2])
    }
  }

  return { boundaryEdges, logicalIndex, logicalToPosition }
}

/**
 * Find boundary loops (holes) as arrays of logical vertex indices.
 */
export function findBoundaryLoops(
  boundaryEdges: [number, number][],
): number[][] {
  const adj = new Map<number, Set<number>>()
  for (const [a, b] of boundaryEdges) {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }

  const loops: number[][] = []
  const visited = new Set<string>()
  const edgeKey = (u: number, v: number) => (u < v ? `${u}_${v}` : `${v}_${u}`)

  for (const [start] of adj.entries()) {
    for (const nbr of adj.get(start)!) {
      const k = edgeKey(start, nbr)
      if (visited.has(k)) continue

      const loop: number[] = []
      let prev = start
      let cur = nbr
      loop.push(start, cur)
      visited.add(k)

      while (true) {
        const neighbors = Array.from(adj.get(cur) || [])
        const next = neighbors.find((n) => n !== prev)
        if (next === undefined) break
        visited.add(edgeKey(cur, next))
        if (next === start) break
        if (loop.includes(next)) break
        loop.push(next)
        prev = cur
        cur = next
      }

      if (loop.length >= 3) loops.push(loop)
    }
  }
  return loops
}

/**
 * Ensure each loop is oriented to match the mesh's local orientation.
 * This is critical for correct patch normal direction after mesh clipping or flipping.
 */
function ensureLoopOrientationMatchesMesh(
  loop: number[],
  logicalToPosition: Map<number, Vector3>,
  geometry: BufferGeometry,
  logicalIndex: number[],
): number[] {
  // Build a map from logical index to mesh indices
  const logicalToMeshIndices = new Map<number, number[]>()
  logicalIndex.forEach((logical, meshIdx) => {
    if (!logicalToMeshIndices.has(logical))
      logicalToMeshIndices.set(logical, [])
    logicalToMeshIndices.get(logical)!.push(meshIdx)
  })
  const indexArray = geometry.index
    ? (geometry.index.array as ArrayLike<number>)
    : Array.from({ length: geometry.attributes.position.count }, (_, i) => i)
  const posAttr = geometry.attributes.position as BufferAttribute

  // For each loop edge, try to find a triangle in the mesh that uses it
  let foundNormal: Vector3 | null = null
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i],
      b = loop[(i + 1) % loop.length]
    const meshA = logicalToMeshIndices.get(a) || []
    const meshB = logicalToMeshIndices.get(b) || []
    for (let j = 0; j < indexArray.length; j += 3) {
      const tri = [indexArray[j], indexArray[j + 1], indexArray[j + 2]]
      // For each edge direction in triangle
      for (let k = 0; k < 3; ++k) {
        const v0 = tri[k],
          v1 = tri[(k + 1) % 3]
        if (
          (meshA.includes(v0) && meshB.includes(v1)) ||
          (meshA.includes(v1) && meshB.includes(v0))
        ) {
          // Found a triangle using this edge!
          const v0pos = new Vector3(
            posAttr.getX(tri[0]),
            posAttr.getY(tri[0]),
            posAttr.getZ(tri[0]),
          )
          const v1pos = new Vector3(
            posAttr.getX(tri[1]),
            posAttr.getY(tri[1]),
            posAttr.getZ(tri[1]),
          )
          const v2pos = new Vector3(
            posAttr.getX(tri[2]),
            posAttr.getY(tri[2]),
            posAttr.getZ(tri[2]),
          )
          foundNormal = v1pos
            .clone()
            .sub(v0pos)
            .cross(v2pos.clone().sub(v0pos))
            .normalize()
          break
        }
      }
      if (foundNormal) break
    }
    if (foundNormal) break
  }
  if (!foundNormal) {
    // Could not find a triangle, return as-is
    return loop
  }
  // Compute loop normal (Newell)
  const loopVerts = loop.map((idx) => logicalToPosition.get(idx)!)
  let nx = 0,
    ny = 0,
    nz = 0
  for (let i = 0; i < loopVerts.length; i++) {
    const a = loopVerts[i],
      b = loopVerts[(i + 1) % loopVerts.length]
    nx += (a.y - b.y) * (a.z + b.z)
    ny += (a.z - b.z) * (a.x + b.x)
    nz += (a.x - b.x) * (a.y + b.y)
  }
  const loopNormal = new Vector3(nx, ny, nz).normalize()
  // If dot < 0, reverse the loop
  if (loopNormal.dot(foundNormal) < 0) {
    return loop.slice().reverse()
  } else {
    return loop
  }
}

/**
 * Project a 3D loop to 2D using a best-fit plane (Newell's method).
 * Returns both 2D points and the logical index mapping.
 */
function projectLoopWithIndexMap(
  loop: number[],
  logicalToPosition: Map<number, Vector3>,
): {
  pts2: [number, number][]
  indexMap: number[]
  centroid: Vector3
  u: Vector3
  v: Vector3
} {
  const pts3 = loop.map((i) => logicalToPosition.get(i)!.clone())

  // Newell's method for normal
  let nx = 0,
    ny = 0,
    nz = 0
  for (let i = 0; i < pts3.length; i++) {
    const a = pts3[i]
    const b = pts3[(i + 1) % pts3.length]
    nx += (a.y - b.y) * (a.z + b.z)
    ny += (a.z - b.z) * (a.x + b.x)
    nz += (a.x - b.x) * (a.y + b.y)
  }
  const normal = new Vector3(nx, ny, nz)
  if (normal.lengthSq() === 0) {
    normal.copy(
      new Vector3()
        .subVectors(pts3[1], pts3[0])
        .cross(new Vector3().subVectors(pts3[2], pts3[0])),
    )
  }
  normal.normalize()

  const u = new Vector3()
  if (Math.abs(normal.x) > 0.9) u.set(0, 1, 0)
  else u.set(1, 0, 0)
  u.cross(normal).normalize()
  const v = new Vector3().crossVectors(normal, u).normalize()

  const centroid = pts3
    .reduce((acc, p) => acc.add(p), new Vector3())
    .multiplyScalar(1 / pts3.length)

  const pts2: [number, number][] = []
  for (const p of pts3) {
    const rel = new Vector3().subVectors(p, centroid)
    pts2.push([rel.dot(u), rel.dot(v)])
  }
  return { pts2, indexMap: loop.slice(), centroid, u, v }
}

// Uniformly sample interior Steiner points in 2D polygon
function sampleSteinerPoints2D(
  polygon: [number, number][],
  numPoints: number,
): [number, number][] {
  // Simple bounding box rejection sampling
  const xs = polygon.map((p) => p[0])
  const ys = polygon.map((p) => p[1])
  const minX = Math.min(...xs),
    maxX = Math.max(...xs)
  const minY = Math.min(...ys),
    maxY = Math.max(...ys)
  const points: [number, number][] = []

  function pointInPolygon(pt: [number, number]): boolean {
    // Ray-casting method
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0],
        yi = polygon[i][1]
      const xj = polygon[j][0],
        yj = polygon[j][1]
      const intersect =
        yi > pt[1] !== yj > pt[1] &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi
      if (intersect) inside = !inside
    }
    return inside
  }

  let tries = 0
  while (points.length < numPoints && tries < numPoints * 100) {
    const x = minX + Math.random() * (maxX - minX)
    const y = minY + Math.random() * (maxY - minY)
    if (pointInPolygon([x, y])) {
      points.push([x, y])
    }
    tries++
  }
  return points
}

// Ray-casting method for point-in-polygon test (outer scope)
function pointInPolygon(
  pt: [number, number],
  polygon: [number, number][],
): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1]
    const xj = polygon[j][0],
      yj = polygon[j][1]
    const intersect =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Keep only triangles whose centroid is inside the polygon
function filterTrianglesInsideBoundary(
  triangles: Uint32Array | number[],
  points2d: [number, number][],
  boundary: [number, number][],
): number[] {
  const filtered: number[] = []
  for (let i = 0; i < triangles.length; i += 3) {
    const a = points2d[triangles[i]]
    const b = points2d[triangles[i + 1]]
    const c = points2d[triangles[i + 2]]
    const centroid: [number, number] = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
    ]
    if (pointInPolygon(centroid, boundary)) {
      filtered.push(triangles[i], triangles[i + 1], triangles[i + 2])
    }
  }
  return filtered
}

function makePatchIndices(
  tris: number[] | Uint32Array,
  base: number,
  flip: boolean,
) {
  const inds: number[] = []
  for (let i = 0; i < tris.length; i += 3) {
    inds.push(
      base + tris[i],
      base + tris[flip ? i + 2 : i + 1],
      base + tris[flip ? i + 1 : i + 2],
    )
  }
  return inds
}

// --- Plane-based normal helpers ---
function computeLoopNormal(boundaryVerts: Vector3[]): Vector3 {
  const normal = new Vector3()
  for (let i = 0; i < boundaryVerts.length; ++i) {
    const curr = boundaryVerts[i]
    const next = boundaryVerts[(i + 1) % boundaryVerts.length]
    normal.x += (curr.y - next.y) * (curr.z + next.z)
    normal.y += (curr.z - next.z) * (curr.x + next.x)
    normal.z += (curr.x - next.x) * (curr.y + next.y)
  }
  return normal.lengthSq() === 0 ? new Vector3(0, 0, 1) : normal.normalize()
}
function patchAverageNormal(
  indices: number[],
  all3d: Vector3[],
  baseIndex: number,
): Vector3 {
  const sum = new Vector3()
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i],
      ib = indices[i + 1],
      ic = indices[i + 2]
    const a = all3d[ia - baseIndex],
      b = all3d[ib - baseIndex],
      c = all3d[ic - baseIndex]
    const n = b.clone().sub(a).cross(c.clone().sub(a))
    sum.add(n)
  }
  return sum.lengthSq() === 0 ? new Vector3(0, 0, 1) : sum.normalize()
}

/**
 * Triangulate boundary loops using Constrainautor with interior Steiner points.
 * For each patch, computes best-fit plane of the loop and chooses
 * patch winding whose average normal matches the loop plane normal.
 * Loops must be consistently oriented.
 */
export function triangulateBoundaryLoopsConstrainautor(
  loops: number[][],
  logicalToPosition: Map<number, Vector3>,
  geometry: BufferGeometry,
  logicalIndex: number[],
  steinerDensity: number = 0,
): BufferGeometry {
  const outPositions: number[] = []
  const outIndices: number[] = []
  let nextIndex = 0

  for (const loop of loops) {
    if (loop.length < 3) continue
    const { pts2, indexMap, centroid, u, v } = projectLoopWithIndexMap(
      loop,
      logicalToPosition,
    )
    const nSteiner = Math.max(0, Math.round(pts2.length * steinerDensity))
    const steiner2d = nSteiner > 0 ? sampleSteinerPoints2D(pts2, nSteiner) : []
    const all2d = pts2.concat(steiner2d)

    const edges: [number, number][] = pts2.map((_, i) => [
      i,
      (i + 1) % pts2.length,
    ])
    const delaunay = Delaunator.from(all2d)
    new Constrainautor(delaunay, edges)

    const filteredTriangles = filterTrianglesInsideBoundary(
      delaunay.triangles,
      all2d,
      pts2,
    )

    const boundaryVerts = indexMap.map((idx) =>
      logicalToPosition.get(idx)!.clone(),
    )
    const steinerVerts = steiner2d.map(([x, y]) =>
      centroid
        .clone()
        .add(u.clone().multiplyScalar(x))
        .add(v.clone().multiplyScalar(y)),
    )
    const all3d = boundaryVerts.concat(steinerVerts)
    const baseIndex = nextIndex

    for (const p of all3d) outPositions.push(p.x, p.y, p.z)
    nextIndex += all3d.length

    // --- Robust patch winding selection using plane normal ---
    const loopNormal = computeLoopNormal(boundaryVerts)

    const indicesA = makePatchIndices(filteredTriangles, baseIndex, false)
    const indicesB = makePatchIndices(filteredTriangles, baseIndex, true)
    const patchNormalA = patchAverageNormal(indicesA, all3d, baseIndex)
    const patchNormalB = patchAverageNormal(indicesB, all3d, baseIndex)

    const dotA = loopNormal.dot(patchNormalA)
    const dotB = loopNormal.dot(patchNormalB)

    outIndices.push(...(dotB > dotA ? indicesB : indicesA))
  }

  const geom = new BufferGeometry()
  geom.setAttribute('position', new Float32BufferAttribute(outPositions, 3))
  geom.setIndex(outIndices)
  geom.computeVertexNormals()
  return geom
}

type FillHoleResult = {
  output: BufferGeometry
  boundaryResult?: BoundaryResult
  triangulatedFilledHoleMesh?: BufferGeometry
  loops?: number[][]
}

/**
 * Fill geometry holes with modular loop counting using Constrainautor triangulation.
 * After merging, welds vertices so boundary vertices are truly shared, then recomputes normals.
 */
export function fillGeometryHoles(
  geometry: BufferGeometry,
  tolerance = 1e-5,
  steinerDensity = 0.7, // try 0.5-1 for large holes, 0 for boundary-only
): FillHoleResult {
  const boundaryResult = findPositionBasedBoundaryEdges(geometry, tolerance)
  if (!boundaryResult.boundaryEdges.length) {
    console.warn('fillHole: no boundary edges found.')
    return { output: geometry }
  }
  let loops = findBoundaryLoops(boundaryResult.boundaryEdges)
  // --- Orient each loop to match mesh for robust patching ---
  loops = loops.map((loop) =>
    ensureLoopOrientationMatchesMesh(
      loop,
      boundaryResult.logicalToPosition,
      geometry,
      boundaryResult.logicalIndex,
    ),
  )
  if (loops.length === 0) {
    return { output: geometry, boundaryResult, loops }
  }
  const fillGeometry = triangulateBoundaryLoopsConstrainautor(
    loops,
    boundaryResult.logicalToPosition,
    geometry,
    boundaryResult.logicalIndex,
    steinerDensity,
  )

  // --------------------------------------------------------------------------------------------
  /// debug
  // After you build fillGeometry ("the patch")
  const patchPositions = fillGeometry.getAttribute('position')
  let anyLarge = false
  const allDistances: number[] = []

  for (const loop of loops) {
    for (const logicalIdx of loop) {
      const original = boundaryResult.logicalToPosition.get(logicalIdx)
      if (!original) {
        anyLarge = true
        console.warn(
          `No original position found for logicalIdx ${logicalIdx}. Skipping distance check.`,
        )
        continue
      }
      let found = false
      for (let i = 0; i < patchPositions.count; ++i) {
        const x = patchPositions.getX(i)
        const y = patchPositions.getY(i)
        const z = patchPositions.getZ(i)
        // Use exact match
        if (
          Math.abs(x - original.x) < 1e-8 &&
          Math.abs(y - original.y) < 1e-8 &&
          Math.abs(z - original.z) < 1e-8
        ) {
          found = true
          allDistances.push(0)
          break
        }
        // Or record distance
        const dist = Math.hypot(x - original.x, y - original.y, z - original.z)
        if (dist < 1e-4) {
          allDistances.push(dist)
          found = true
          break
        }
      }
      if (!found) {
        anyLarge = true
        console.warn(
          `No matching patch boundary vertex for logicalIdx ${logicalIdx} at (${original.x},${original.y},${original.z})`,
        )
      }
    }
  }

  if (allDistances.length > 0) {
    const max = Math.max(...allDistances)
    const min = Math.min(...allDistances)
    const avg = allDistances.reduce((a, b) => a + b, 0) / allDistances.length
    console.log(
      `Patch-boundary to mesh-boundary distances: min=${min}, max=${max}, avg=${avg}`,
    )
  }
  if (anyLarge) {
    console.warn(
      'Some patch boundary vertices could not be matched to original mesh boundary (positions differ). This will prevent welding!',
    )
  } else {
    console.log(
      'All patch boundary vertices match original mesh positions within 1e-4. Welding should work.',
    )
  }
  // --------------------------------------------------------------------------------------------

  // Merge geometries (attribute-aware)
  const merged = BufferGeometryUtils.mergeGeometries(
    [geometry, fillGeometry],
    true,
  )
  // Assume 'merged' is your geometry after merging patch and original mesh
  const welded = BufferGeometryUtils.mergeVertices(merged, 1e-4) // or 1e-5
  welded.computeVertexNormals()

  return {
    output: welded,
    boundaryResult,
    triangulatedFilledHoleMesh: fillGeometry,
    loops,
  }
}

export function createBoundaryEdgesMesh(
  boundaryResult: BoundaryResult,
  color: ColorRepresentation = 0xff0000,
): LineSegments {
  const { boundaryEdges, logicalToPosition } = boundaryResult
  const positions = new Float32Array(boundaryEdges.length * 2 * 3)
  let i = 0

  for (const [v1, v2] of boundaryEdges) {
    const p1 = logicalToPosition.get(v1)!
    const p2 = logicalToPosition.get(v2)!
    positions[i++] = p1.x
    positions[i++] = p1.y
    positions[i++] = p1.z
    positions[i++] = p2.x
    positions[i++] = p2.y
    positions[i++] = p2.z
  }

  const edgeGeometry = new BufferGeometry()
  edgeGeometry.setAttribute('position', new BufferAttribute(positions, 3))
  const material = new LineBasicMaterial({
    color,
    depthTest: false,
  })
  const segments = new LineSegments(edgeGeometry, material)
  segments.name = 'Hole Edges'
  return segments
}
