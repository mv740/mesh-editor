import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Vector3,
  type ColorRepresentation,
  type Plane,
} from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { BufferGeometryUtils } from 'three/examples/jsm/Addons.js'
import { Earcut } from 'three/src/extras/Earcut.js'

/**
 * Highly optimized BVH-based clipping that focuses on performance.
 * @param mesh The mesh to clip
 * @param plane The clipping plane
 * @param debug Whether to output timing information (default: false)
 */
export const optimizedBvhClip = (
  mesh: Mesh,
  plane: Plane,
  debug: boolean = false,
): Mesh => {
  if (debug) console.time('BVH Clip')

  // Clone the mesh to avoid modifying the original
  const clonedMesh = mesh.clone()
  const geometry = clonedMesh.geometry as BufferGeometry

  // Ensure the geometry has a BVH
  if (!geometry.boundsTree) {
    if (debug) console.time('BVH Build')
    const bvh = new MeshBVH(geometry)
    geometry.boundsTree = bvh
    if (debug) console.timeEnd('BVH Build')
  }

  // Get positions and indices
  const positionAttribute = geometry.getAttribute('position') as BufferAttribute
  const indices = geometry.index

  // Pre-allocate reusable vectors to avoid creating new ones during traversal
  const center = new Vector3()
  const halfSize = new Vector3()
  const v1 = new Vector3()
  const v2 = new Vector3()
  const v3 = new Vector3()

  // Use a simple array instead of a Set for better performance
  // We'll use a bit array for even better performance with large meshes
  const triangleCount = indices
    ? indices.count / 3
    : positionAttribute.count / 3

  // Create a bit array (Uint8Array where each bit represents a triangle)
  // This is much more memory efficient than a Set for large meshes
  const triangleBits = new Uint8Array(Math.ceil(triangleCount / 8))

  // Function to set a bit in the bit array
  const setBit = (index: number) => {
    const byteIndex = Math.floor(index / 8)
    const bitPosition = index % 8
    triangleBits[byteIndex] |= 1 << bitPosition
  }

  // Function to check if a bit is set
  const isBitSet = (index: number) => {
    const byteIndex = Math.floor(index / 8)
    const bitPosition = index % 8
    return (triangleBits[byteIndex] & (1 << bitPosition)) !== 0
  }

  // Use the BVH to efficiently determine which triangles to keep
  const bvh = geometry.boundsTree as MeshBVH

  if (debug) console.time('BVH Traversal')

  // Quick check if the entire mesh is on one side of the plane
  const box =
    geometry.boundingBox || new Box3().setFromBufferAttribute(positionAttribute)

  // Calculate distance from box to plane
  center.copy(box.min).add(box.max).multiplyScalar(0.5)
  halfSize.copy(box.max).sub(box.min).multiplyScalar(0.5)

  // Project half-extents onto plane normal
  const r =
    halfSize.x * Math.abs(plane.normal.x) +
    halfSize.y * Math.abs(plane.normal.y) +
    halfSize.z * Math.abs(plane.normal.z)

  // Distance from center to plane
  const d = plane.distanceToPoint(center)

  // If the entire mesh is behind the plane, return an empty mesh
  if (d < -r) {
    if (debug) console.timeEnd('BVH Traversal')
    if (debug) console.timeEnd('BVH Clip')

    // Return an empty mesh
    const emptyGeometry = new BufferGeometry()
    const emptyMesh = new Mesh(emptyGeometry, clonedMesh.material)
    emptyMesh.position.copy(mesh.position)
    emptyMesh.rotation.copy(mesh.rotation)
    emptyMesh.scale.copy(mesh.scale)
    return emptyMesh
  }

  // If the entire mesh is in front of the plane, return the original mesh
  if (d > r) {
    if (debug) console.timeEnd('BVH Traversal')
    if (debug) console.timeEnd('BVH Clip')
    return clonedMesh
  }

  // Identify triangles to keep
  bvh.shapecast({
    intersectsBounds: (box, isLeaf) => {
      // Calculate distance from box to plane
      center.copy(box.min).add(box.max).multiplyScalar(0.5)
      halfSize.copy(box.max).sub(box.min).multiplyScalar(0.5)

      // Project half-extents onto plane normal
      const r =
        halfSize.x * Math.abs(plane.normal.x) +
        halfSize.y * Math.abs(plane.normal.y) +
        halfSize.z * Math.abs(plane.normal.z)

      // Distance from center to plane
      const d = plane.distanceToPoint(center)

      // If box is entirely behind plane, skip this subtree
      if (d < -r) {
        return false
      }

      // If box is entirely in front of plane and this is a leaf node,
      // mark all triangles in this node
      if (d > r && isLeaf) {
        // We need to mark all triangles in this leaf node
        // The BVH doesn't directly expose this information, so we'll
        // return true and let intersectsTriangle handle it with the
        // contained flag
        return true
      }

      // Box intersects plane, continue traversal
      return true
    },

    intersectsTriangle: (triangle, triangleIndex, contained) => {
      // If the triangle is in a node that's entirely in front of the plane,
      // mark it without testing
      if (contained) {
        setBit(triangleIndex)
        return false
      }

      // For triangles that might intersect the plane, check individually
      const i0 = indices ? indices.array[triangleIndex * 3] : triangleIndex * 3
      const i1 = indices
        ? indices.array[triangleIndex * 3 + 1]
        : triangleIndex * 3 + 1
      const i2 = indices
        ? indices.array[triangleIndex * 3 + 2]
        : triangleIndex * 3 + 2

      v1.fromBufferAttribute(positionAttribute, i0)
      v2.fromBufferAttribute(positionAttribute, i1)
      v3.fromBufferAttribute(positionAttribute, i2)

      const d1 = plane.distanceToPoint(v1)
      const d2 = plane.distanceToPoint(v2)
      const d3 = plane.distanceToPoint(v3)

      // If all vertices are on or in front of the plane, keep this triangle
      if (d1 >= 0 && d2 >= 0 && d3 >= 0) {
        setBit(triangleIndex)
      }

      return false // Continue traversal
    },
  })
  if (debug) console.timeEnd('BVH Traversal')

  if (debug) console.time('Geometry Filtering')

  // Count how many triangles we're keeping to pre-allocate arrays
  let keepCount = 0
  for (let i = 0; i < triangleCount; i++) {
    if (isBitSet(i)) {
      keepCount++
    }
  }

  // If we're keeping all triangles, return the original mesh
  if (keepCount === triangleCount) {
    if (debug) console.timeEnd('Geometry Filtering')
    if (debug) console.timeEnd('BVH Clip')
    return clonedMesh
  }

  // If we're keeping no triangles, return an empty mesh
  if (keepCount === 0) {
    if (debug) console.timeEnd('Geometry Filtering')
    if (debug) console.timeEnd('BVH Clip')

    // Return an empty mesh
    const emptyGeometry = new BufferGeometry()
    const emptyMesh = new Mesh(emptyGeometry, clonedMesh.material)
    emptyMesh.position.copy(mesh.position)
    emptyMesh.rotation.copy(mesh.rotation)
    emptyMesh.scale.copy(mesh.scale)
    return emptyMesh
  }

  // Create a new filtered index array with pre-allocated size
  const newIndices = new Uint32Array(keepCount * 3)
  let indexOffset = 0

  // Add indices for triangles to keep
  for (let i = 0; i < triangleCount; i++) {
    if (isBitSet(i)) {
      if (indices) {
        // For indexed geometry
        newIndices[indexOffset++] = indices.array[i * 3]
        newIndices[indexOffset++] = indices.array[i * 3 + 1]
        newIndices[indexOffset++] = indices.array[i * 3 + 2]
      } else {
        // For non-indexed geometry
        newIndices[indexOffset++] = i * 3
        newIndices[indexOffset++] = i * 3 + 1
        newIndices[indexOffset++] = i * 3 + 2
      }
    }
  }

  // Create a new geometry by cloning the original and setting the new indices
  // Use a more efficient approach to avoid full geometry cloning
  const clippedGeometry = new BufferGeometry()

  // Copy all attributes from the original geometry
  Object.keys(geometry.attributes).forEach((name) => {
    const attr = geometry.attributes[name]
    if (attr instanceof BufferAttribute) {
      clippedGeometry.setAttribute(name, attr.clone())
    }
  })

  // Set the new index buffer
  clippedGeometry.setIndex(new BufferAttribute(newIndices, 1))

  // Create a new mesh with the clipped geometry
  const clippedMesh = new Mesh(clippedGeometry, clonedMesh.material)

  // Copy transformation from the original mesh
  clippedMesh.position.copy(mesh.position)
  clippedMesh.rotation.copy(mesh.rotation)
  clippedMesh.scale.copy(mesh.scale)

  if (debug) console.timeEnd('Geometry Filtering')
  if (debug) console.timeEnd('BVH Clip')

  return clippedMesh
}

type BoundaryResult = {
  boundaryEdges: [number, number][]
  logicalIndex: number[]
  logicalToPosition: Map<number, Vector3>
}

/**
 * Find boundary edges based only on vertex positions (ignores seams).
 * @param geometry BufferGeometry to analyze
 * @param tolerance merge tolerance for welding vertices
 */
export function findPositionBasedBoundaryEdges(
  geometry: BufferGeometry,
  tolerance: number = 1e-5,
): BoundaryResult {
  const posAttr = geometry.attributes.position as BufferAttribute
  const vertexMap = new Map<string, number>() // pos key -> logical index
  const logicalToPosition = new Map<number, Vector3>() // logical index -> position
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
 * Create a THREE.LineSegments visualizing the boundary edges.
 */
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
    depthTest: false, // always visible
  })

  const segments = new LineSegments(edgeGeometry, material)
  segments.name = 'Hole Edges'
  return segments
}

export function triangulateBoundariesToGeometry(
  boundaryResult: BoundaryResult,
): BufferGeometry {
  const { boundaryEdges, logicalToPosition } = boundaryResult

  // adjacency map
  const adj = new Map<number, Set<number>>()
  for (const [a, b] of boundaryEdges) {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }

  // extract loops
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

  // helper: best-fit plane + 2D projection
  function projectLoop(loop: number[]) {
    const pts3 = loop.map((i) => logicalToPosition.get(i)!.clone())

    // Newell's method
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

    const pts2: number[] = []
    for (const p of pts3) {
      const rel = new Vector3().subVectors(p, centroid)
      pts2.push(rel.dot(u), rel.dot(v))
    }

    return { pts2, loop }
  }

  const outPositions: number[] = []
  const outIndices: number[] = []
  const globalVertexMap = new Map<number, number>()
  let nextIndex = 0

  function ensureVertex(logicalIdx: number): number {
    if (globalVertexMap.has(logicalIdx)) return globalVertexMap.get(logicalIdx)!
    const p = logicalToPosition.get(logicalIdx)!
    outPositions.push(p.x, p.y, p.z)
    globalVertexMap.set(logicalIdx, nextIndex)
    return nextIndex++
  }

  // triangulate each loop
  for (const loop of loops) {
    const { pts2 } = projectLoop(loop)
    const tris = Earcut.triangulate(pts2, [], 2)
    for (let i = 0; i < tris.length; i += 3) {
      const a = ensureVertex(loop[tris[i]])
      const b = ensureVertex(loop[tris[i + 1]])
      const c = ensureVertex(loop[tris[i + 2]])
      outIndices.push(a, b, c)
    }
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
}

export function fillGeometryHoles(
  geometry: BufferGeometry,
  tolerance = 1e-5,
): FillHoleResult {
  const boundaryResult = findPositionBasedBoundaryEdges(geometry, tolerance)

  if (!boundaryResult.boundaryEdges.length) {
    console.warn('fillHole: no boundary edges found.')
    return { output: geometry }
  }

  // print number of holes found
  console.log(`fillHole: ${boundaryResult.boundaryEdges.length} holes found.`)
  const fillGeometry = triangulateBoundariesToGeometry(boundaryResult)
  const merged = BufferGeometryUtils.mergeGeometries(
    [geometry, fillGeometry],
    true,
  )
  merged.computeVertexNormals()
  return {
    output: merged,
    boundaryResult,
    triangulatedFilledHoleMesh: fillGeometry,
  }
}
