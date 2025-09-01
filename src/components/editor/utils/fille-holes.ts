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
import {
  mergeGeometries,
  mergeVertices,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { computeConsistentNormals } from './normal'

export type BoundaryResult = {
  boundaryEdges: [number, number][]
  logicalIndex: number[]
  logicalToPosition: Map<number, Vector3>
}

function computeLoopNormal(loopVerts: Vector3[]): Vector3 {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let i = 0; i < loopVerts.length; i++) {
    const a = loopVerts[i]
    const b = loopVerts[(i + 1) % loopVerts.length]
    nx += (a.y - b.y) * (a.z + b.z)
    ny += (a.z - b.z) * (a.x + b.x)
    nz += (a.x - b.x) * (a.y + b.y)
  }
  const normal = new Vector3(nx, ny, nz)
  return normal.lengthSq() ? normal.normalize() : new Vector3(0, 0, 1)
}

/**
 * Finds boundary edges in a geometry based on vertex positions, grouping vertices that are within a given tolerance.
 *
 * This function maps vertices to logical indices by rounding their positions according to the specified tolerance,
 * then identifies edges that appear only once among all triangles (i.e., boundary edges).
 *
 * @param geometry - The BufferGeometry to analyze for boundary edges.
 * @param tolerance - The positional tolerance for grouping vertices (default: 1e-5).
 * @returns An object containing:
 *   - `boundaryEdges`: An array of boundary edge pairs, each as a tuple of logical vertex indices.
 *   - `logicalIndex`: An array mapping each original vertex index to its logical index.
 *   - `logicalToPosition`: A map from logical index to the corresponding vertex position (Vector3).
 */
export function findPositionBasedBoundaryEdges(
  geometry: BufferGeometry,
  tolerance = 1e-5,
): BoundaryResult {
  const posAttr = geometry.getAttribute('position') as BufferAttribute
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
    ? Array.from(geometry.index.array as ArrayLike<number>)
    : Array.from({ length: posAttr.count }, (_, i) => i)

  const edgeCount = new Map<string, number>()
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)

  for (let i = 0; i < indexArray.length; i += 3) {
    const [a, b, c] = [
      logicalIndex[indexArray[i]],
      logicalIndex[indexArray[i + 1]],
      logicalIndex[indexArray[i + 2]],
    ]
    for (const [v1, v2] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = edgeKey(v1, v2)
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1)
    }
  }

  const boundaryEdges: [number, number][] = []
  for (const [key, count] of edgeCount.entries())
    if (count === 1)
      boundaryEdges.push(key.split('_').map(Number) as [number, number])

  return { boundaryEdges, logicalIndex, logicalToPosition }
}

/**
 * Finds all boundary loops in a set of boundary edges.
 *
 * Given a list of undirected edges representing the boundaries of a mesh,
 * this function reconstructs all closed loops formed by these edges.
 * Each loop is returned as an array of vertex indices in order.
 *
 * @param boundaryEdges - An array of pairs of vertex indices, where each pair represents an undirected edge on the boundary.
 * @returns An array of loops, where each loop is an array of vertex indices representing a closed boundary.
 */
export function findBoundaryLoops(
  boundaryEdges: [number, number][],
): number[][] {
  // Build a mutable adjacency map (undirected)
  const adj = new Map<number, Set<number>>()
  for (const [a, b] of boundaryEdges) {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }

  const removeEdge = (u: number, v: number) => {
    const s = adj.get(u)
    if (!s) return
    s.delete(v)
    if (s.size === 0) adj.delete(u)
  }

  const loops: number[][] = []

  // While there are edges remaining, walk them and remove as we go.
  // This ensures each undirected boundary edge is consumed exactly once and
  // produces disjoint closed cycles (open paths are ignored).
  while (true) {
    let start: number | undefined
    for (const [k, s] of adj.entries()) {
      if (s.size > 0) {
        start = k
        break
      }
    }
    if (start === undefined) break

    const sStart = start
    const nbrs = adj.get(sStart)!
    const firstIter = nbrs.values().next()
    const first = firstIter.value
    if (first === undefined) continue
    // remove the first edge and begin walking
    removeEdge(sStart, first)
    removeEdge(first, sStart)

    const loop: number[] = [sStart, first]
    let prev: number = sStart
    let cur: number = first
    let closed = false

    while (true) {
      const neighbors = adj.get(cur)
      if (!neighbors || neighbors.size === 0) break

      // pick any available neighbor (prefer one that's not the vertex we came from)
      let next: number | undefined
      for (const n of neighbors) {
        next = n
        if (n !== prev) break
      }
      if (next === undefined) break

      // consume edge cur-next
      removeEdge(cur, next)
      removeEdge(next, cur)
      loop.push(next)

      prev = cur
      cur = next
      if (cur === start) {
        closed = true
        break
      }
    }

    if (closed) {
      // If the loop accidentally duplicated the start at the end, drop it
      if (loop.length >= 2 && loop[0] === loop.at(-1)) loop.pop()
      if (loop.length >= 3) loops.push(loop)
    }
    // if not closed we simply drop the open path (it's not a boundary loop)
  }

  return loops
}

/**
 * Projects a loop of vertex indices onto a 2D plane based on their 3D positions.
 *
 * Given a loop of indices and a mapping from logical indices to 3D positions,
 * this function computes the normal of the loop, determines a local 2D basis (u, v),
 * and projects each vertex onto this plane relative to the loop's centroid.
 *
 * @param loop - Array of vertex indices representing the loop.
 * @param logicalToPosition - Map from logical vertex indices to their 3D positions (Vector3).
 * @returns An object containing:
 *   - pts2: The projected 2D coordinates of the loop vertices.
 *   - indexMap: A copy of the input loop indices.
 *   - centroid: The centroid of the loop in 3D space.
 *   - u: The first basis vector of the local 2D plane.
 *   - v: The second basis vector of the local 2D plane.
 */
function projectLoopWithIndexMap(
  loop: number[],
  logicalToPosition: Map<number, Vector3>,
) {
  const pts3 = loop.map((i) => logicalToPosition.get(i)!.clone())
  const normal = computeLoopNormal(pts3)
  const u =
    Math.abs(normal.x) > 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  u.cross(normal).normalize()
  const v = new Vector3().crossVectors(normal, u).normalize()
  const centroid = pts3
    .reduce((acc, p) => acc.add(p), new Vector3())
    .multiplyScalar(1 / pts3.length)
  const pts2: [number, number][] = pts3.map((p) => {
    const rel = new Vector3().subVectors(p, centroid)
    return [rel.dot(u), rel.dot(v)]
  })
  return { pts2, indexMap: loop.slice(), centroid, u, v }
}

/**
 * Compute the 2D area of a loop by projecting it to a local plane and using the shoelace formula.
 */
function computeLoopArea(
  loop: number[],
  logicalToPosition: Map<number, Vector3>,
) {
  const { pts2 } = projectLoopWithIndexMap(loop, logicalToPosition)
  let sum = 0
  for (let i = 0; i < pts2.length; i++) {
    const [x1, y1] = pts2[i]
    const [x2, y2] = pts2[(i + 1) % pts2.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) * 0.5
}

/**
 * Samples a specified number of random Steiner points inside a given 2D polygon.
 * Points are uniformly sampled within the polygon's bounding box and tested for inclusion.
 *
 * @param polygon - An array of [x, y] coordinate pairs representing the vertices of the polygon.
 * @param numPoints - The number of Steiner points to sample inside the polygon.
 * @returns An array of [x, y] coordinate pairs representing the sampled Steiner points.
 */
function sampleSteinerPoints2D(
  polygon: [number, number][],
  numPoints: number,
): [number, number][] {
  const xs = polygon.map((p) => p[0])
  const ys = polygon.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const points: [number, number][] = []
  let tries = 0
  while (points.length < numPoints && tries < numPoints * 100) {
    const x = minX + Math.random() * (maxX - minX)
    const y = minY + Math.random() * (maxY - minY)
    if (pointInPolygon([x, y], polygon)) points.push([x, y])
    tries++
  }
  return points
}

/**
 * Determines whether a given point lies inside a polygon using the ray-casting algorithm.
 *
 * @param pt - The point to test, represented as a tuple [x, y].
 * @param polygon - An array of points representing the polygon, each as a tuple [x, y].
 * @returns `true` if the point is inside the polygon, `false` otherwise.
 */
function pointInPolygon(pt: [number, number], polygon: [number, number][]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]
    const intersect =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Filters triangles whose centroids are inside a given boundary polygon.
 *
 * Iterates over the provided triangle indices, computes the centroid of each triangle
 * using the corresponding 2D points, and includes the triangle in the result if its
 * centroid lies within the specified boundary polygon.
 *
 * @param triangles - An array of triangle vertex indices (each group of 3 defines a triangle).
 * @param points2d - An array of 2D points corresponding to the vertex indices.
 * @param boundary - An array of 2D points defining the boundary polygon.
 * @returns An array of triangle vertex indices for triangles whose centroids are inside the boundary.
 */
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
    if (pointInPolygon(centroid, boundary))
      filtered.push(triangles[i], triangles[i + 1], triangles[i + 2])
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

/**
 * Triangulates multiple boundary loops with optional Steiner point insertion and constrained triangulation.
 *
 * Projects each loop to 2D, samples Steiner points if requested, and performs constrained Delaunay triangulation.
 * The resulting triangles are filtered to remain inside the original boundary, and the final mesh is reconstructed in 3D.
 *
 * @param loops - An array of boundary loops, each represented as an array of logical vertex indices.
 * @param logicalToPosition - A map from logical vertex indices to their 3D positions (Vector3).
 * @param steinerDensity - Optional density of Steiner points to insert for improved triangulation (default is 0).
 * @returns A BufferGeometry containing the triangulated mesh patch for all input loops.
 */
export function triangulateBoundaryLoopsConstrainautor(
  loops: number[][],
  logicalToPosition: Map<number, Vector3>,
  steinerDensity: number = 0,
): BufferGeometry {
  const outPositions: number[] = []
  const outIndices: number[] = []
  let nextIndex = 0

  for (const [, loop] of loops.entries()) {
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

    // Generate constrained Delaunay triangulation. Constrainautor may fail
    // when a constraint edge intersects a point (numerical/degenerate cases).
    // We try to constrain with Steiner points first; on failure we retry
    // without Steiner points, and finally fall back to unconstrained
    // Delaunator followed by interior filtering.
    let delaunay = Delaunator.from(all2d)
    try {
      const con = new Constrainautor(delaunay)
      con.delaunify(true)
      con.constrainAll(edges)
    } catch (error) {
      console.info(
        'Constrainautor failed with steiner points, retrying without Steiner points:',
        error,
      )
      // Retry without Steiner points if we had any
      if (steiner2d.length > 0) {
        try {
          const all2dRetry = pts2.slice()
          delaunay = Delaunator.from(all2dRetry)
          const con2 = new Constrainautor(delaunay)
          con2.delaunify(true)
          con2.constrainAll(edges)
        } catch (error) {
          console.info(
            'Constrainautor also failed without Steiner points, falling back to unconstrained triangulation:',
            error,
          )
          // leave delaunay as the unconstrained triangulation of all2d (or pts2)
          // we'll filter by polygon interior below
        }
      } else {
        console.info(
          'Constrainautor failed (no Steiner points available), falling back to unconstrained triangulation',
        )
      }
    }

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

    const indices = makePatchIndices(filteredTriangles, baseIndex, false)
    outIndices.push(...indices)
  }
  const geom = new BufferGeometry()
  geom.setAttribute('position', new Float32BufferAttribute(outPositions, 3))
  geom.setIndex(outIndices)

  return geom
}

type FillHoleResult = {
  output: BufferGeometry
  boundaryResult?: BoundaryResult
  triangulatedFilledHoleMesh?: BufferGeometry
  loops?: number[][]
}

/**
 * Fills holes in a given BufferGeometry by detecting boundary edges, forming loops,
 * and triangulating the resulting boundaries. The function merges the original geometry
 * with the generated patch, welds duplicate vertices, and ensures consistent normals.
 *
 * @param geometry - The input BufferGeometry to process and fill holes in.
 * @param tolerance - Optional. The positional tolerance for detecting boundary edges. Defaults to 1e-5.
 * @param steinerDensity - Optional. Controls the density of Steiner points for triangulation. Defaults to 0.7.
 * @returns An object containing the output geometry with holes filled, boundary detection results,
 *          the triangulated mesh used to fill holes, and the detected boundary loops.
 */
export function fillGeometryHoles(
  geometry: BufferGeometry,
  tolerance = 1e-5,
  steinerDensity = 0.7,
  maxHoleArea?: number,
  debugOnlyBoundary?: boolean,
  splitAngleDeg?: number,
): FillHoleResult {
  // Require input geometry to be indexed. Do not auto-convert here.
  if (!geometry.index) {
    throw new Error(
      'fillGeometryHoles requires an indexed geometry (geometry.index must be present)',
    )
  }
  const boundaryResult = findPositionBasedBoundaryEdges(geometry, tolerance)
  if (!boundaryResult.boundaryEdges.length) return { output: geometry }
  const loops = findBoundaryLoops(boundaryResult.boundaryEdges)
  console.info('Number of boundary loops:', loops.length)
  loops.forEach((loop, i) => {
    console.info(`Loop ${i}: length ${loop.length}`)
  })

  if (debugOnlyBoundary) return { output: geometry, boundaryResult, loops }

  // Optionally skip very large loops (e.g. big openings or cavities). If
  // maxHoleArea is provided, compute each loop area and filter out loops
  // whose projected area exceeds the threshold. Default behavior (no
  // options) preserves previous behavior.
  const maxArea = maxHoleArea ?? Infinity
  let usedLoops = loops
  if (Number.isFinite(maxArea)) {
    usedLoops = loops.filter(
      (loop) =>
        computeLoopArea(loop, boundaryResult.logicalToPosition) <= maxArea,
    )
  }

  if (usedLoops.length === 0) return { output: geometry, boundaryResult, loops }
  const fillGeometry = triangulateBoundaryLoopsConstrainautor(
    usedLoops,
    boundaryResult.logicalToPosition,
    steinerDensity,
  )

  geometry.computeVertexNormals()
  fillGeometry.computeVertexNormals()

  // Merge the original geometry and the patch.
  const merged = mergeGeometries(
    [geometry, fillGeometry],
    true,
  ) as BufferGeometry

  const weldTolerance = 1e-6
  const welded = mergeVertices(merged, weldTolerance) as BufferGeometry
  welded.computeVertexNormals()

  // compute and fix normals using your global routine
  const normalMeshFixed = computeConsistentNormals(welded, {
    flipIfInward: true,
    splitAngleDeg: splitAngleDeg ?? 0,
  })

  return {
    output: normalMeshFixed,
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
  const material = new LineBasicMaterial({ color, depthTest: false })
  const segments = new LineSegments(edgeGeometry, material)
  segments.name = 'Hole Edges'
  return segments
}
