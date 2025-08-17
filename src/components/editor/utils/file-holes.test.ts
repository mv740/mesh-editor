import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { STLLoader } from 'three/examples/jsm/Addons.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  fillGeometryHoles,
  findBoundaryLoops,
  findPositionBasedBoundaryEdges,
} from './fille-holes'
import type { BufferGeometry } from 'three'

describe('FileHoles', () => {
  let geometry: BufferGeometry
  beforeAll(() => {
    const filePath = resolve(process.cwd(), 'playground/assets/bunny.bin.stl')
    const fileBuffer = readFileSync(filePath)
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    )
    const loader = new STLLoader()
    geometry = loader.parse(arrayBuffer)
    geometry.computeVertexNormals()
  })

  afterAll(() => {
    // optional cleanup
    geometry.dispose?.()
  })

  test('should find holes in the mesh', () => {
    expect(geometry).toBeDefined()
    const geometryClone = geometry.clone()

    // find holes in the mesh
    const boundaryEdges = findPositionBasedBoundaryEdges(geometryClone)
    expect(boundaryEdges).toBeDefined()
    expect(boundaryEdges.boundaryEdges.length).toBeGreaterThan(0)

    // find holes
    const loops = findBoundaryLoops(boundaryEdges.boundaryEdges)
    expect(loops).toBeDefined()
    // stanford bunny has 5 holes
    expect(loops.length).equal(5)
  })

  describe('fillGeometryHoles', () => {
    test('filling holes should have no holes', () => {
      expect(geometry).toBeDefined()
      const geometryClone = geometry.clone()

      // create indexed geometry
      const indexedGeometry = mergeVertices(geometryClone)

      const result = fillGeometryHoles(indexedGeometry)

      // check that there are no holes
      const newBoundaryEdges = findPositionBasedBoundaryEdges(result.output)
      expect(newBoundaryEdges.boundaryEdges.length).toBe(0)
    })

    test('filling holes should have no holes', () => {
      expect(geometry).toBeDefined()
      const geometryClone = geometry.clone()

      // create indexed geometry

      expect(() => fillGeometryHoles(geometryClone)).toThrowError(
        'fillGeometryHoles requires an indexed geometry (geometry.index must be present)',
      )
    })
  })
})
