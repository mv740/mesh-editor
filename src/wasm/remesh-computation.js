import { BufferAttribute, BufferGeometry } from 'three'

export class RemeshComputation {
  constructor(vertices, indices, options) {
    // vertices: [[x, y, z], ...] or flat array
    // indices: [[i0, i1, i2], ...] or flat array

    if (Array.isArray(vertices[0])) {
      this.vertices = new Float64Array(vertices.flat())
      this.numVertices = vertices.length
    } else {
      this.vertices = new Float64Array(vertices)
      this.numVertices = this.vertices.length / 3
    }

    if (Array.isArray(indices[0])) {
      this.indices = new Int32Array(indices.flat())
      this.numIndices = indices.length * 3
    } else {
      this.indices = new Int32Array(indices)
      this.numIndices = this.indices.length
    }

    // Default remeshing parameters (match your C++ signature)
    const defaults = {
      targetNumPoints: 1000, // desired output vertex count
      remeshDim: 3, // 3 for isotropic, 6 for anisotropic
    }

    console.log('Remeshing parameters provided:', options)

    this.params = Object.assign(defaults, options)

    console.log(
      `Initialized RemeshComputation with ${this.numVertices} vertices and ${this.numIndices / 3} faces.`,
    )
    console.log('Remeshing parameters:', this.params)

    this.remeshedVertices = []
    this.remeshedIndices = []
  }

  /**
   * Run remeshing using the WASM module
   * @param {object} wasmModule - The loaded WASM module
   * @returns {RemeshComputation}
   */
  async remesh(wasmModule) {
    if (!wasmModule) {
      throw new Error('WASM module not provided')
    }

    try {
      // Create embind vectors from arrays
      const vertsVec = new wasmModule.VectorDouble()
      for (let i = 0; i < this.vertices.length; ++i) {
        vertsVec.push_back(this.vertices[i])
      }
      const indsVec = new wasmModule.VectorInt()
      for (let i = 0; i < this.indices.length; ++i) {
        indsVec.push_back(this.indices[i])
      }

      const result = wasmModule.remesh(
        vertsVec,
        indsVec,
        this.numVertices,
        this.numIndices,
        this.params.targetNumPoints,
        this.params.remeshDim,
      )
      // result.vertices and result.indices are embind vectors
      this.remeshedVertices = []
      this.remeshedIndices = []
      for (let i = 0; i < result.vertices.size(); ++i) {
        this.remeshedVertices.push(result.vertices.get(i))
      }
      for (let i = 0; i < result.indices.size(); ++i) {
        this.remeshedIndices.push(result.indices.get(i))
      }

      // Clean up embind objects if necessary
      vertsVec.delete()
      indsVec.delete()
      result.vertices.delete()
      result.indices.delete()
    } catch (error) {
      console.error('Error in remeshing:', error)
      throw error
    }

    return this // chaining
  }

  getRemeshedVertices() {
    return this.remeshedVertices
  }

  getRemeshedIndices() {
    return this.remeshedIndices
  }

  toThreeGeometry() {
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(this.remeshedVertices), 3),
    )
    geometry.setIndex(
      new BufferAttribute(new Uint32Array(this.remeshedIndices), 1),
    )
    geometry.computeVertexNormals()
    return geometry
  }
}
