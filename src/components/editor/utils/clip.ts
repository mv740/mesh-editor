import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  Vector3,
  type Plane,
} from 'three'
import { MeshBVH } from 'three-mesh-bvh'

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

export const filterPointsByPlane = (
  points: Vector3[],
  plane: Plane,
  options: { epsilon?: number; keepOnPlane?: boolean } = {},
): Vector3[] => {
  const { epsilon = 0, keepOnPlane = true } = options
  let cmp: (d: number) => boolean
  if (keepOnPlane) cmp = (d: number) => d >= -epsilon
  else cmp = (d: number) => d > epsilon
  return points.filter((p) => cmp(plane.distanceToPoint(p)))
}

/**
 * Partition an array of items by a plane. Useful for landmarks (objects)
 * where you need to remove items whose positions are on the clipped side.
 *
 * Example: const { kept, removed } = partitionPointsByPlane(landmarks, l => l.position, plane)
 */
export function partitionPointsByPlane<T>(
  items: T[],
  getPoint: (item: T) => Vector3,
  plane: Plane,
  epsilon = 0,
  keepOnPlane = true,
): { kept: T[]; removed: T[] } {
  const kept: T[] = []
  const removed: T[] = []
  let cmp: (d: number) => boolean
  if (keepOnPlane) cmp = (d: number) => d >= -epsilon
  else cmp = (d: number) => d > epsilon
  for (const item of items) {
    const pt = getPoint(item)
    if (cmp(plane.distanceToPoint(pt))) kept.push(item)
    else removed.push(item)
  }
  return { kept, removed }
}
