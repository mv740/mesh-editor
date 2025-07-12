import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import ReactThreeTestRenderer from '@react-three/test-renderer'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { GeometryModel } from './geometry-model'

describe('GeometryModel', () => {
  it('should render', async () => {
    // Resolve from project root
    const filePath = resolve(process.cwd(), 'playground/assets/bunny.bin.stl')
    expect(existsSync(filePath)).toBe(true)

    // Read file and convert to data URL
    const fileBuffer = readFileSync(filePath)
    const base64 = fileBuffer.toString('base64')
    const dataUrl = `data:application/octet-stream;base64,${base64}`

    // Using data URL instead of blob URL'

    const renderer = await ReactThreeTestRenderer.create(
      <GeometryModel stlUrl={dataUrl} />,
    )

    // assertions using the TestInstance & Scene Graph
    const graph = renderer.toGraph()
    expect(graph).toBeDefined()

    expect(graph?.length).toBeDefined()

    expect(graph).toBeDefined()

    // contain 1 node
    expect(graph?.length).toBe(1)
    // mesh has 2 children
    expect(graph?.[0].children?.length).toBe(2)
  })
})
