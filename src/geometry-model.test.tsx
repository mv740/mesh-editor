import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import ReactThreeTestRenderer from '@react-three/test-renderer'
import React from 'react'
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { GeometryModel, type SelectedPoint } from './geometry-model'

describe('GeometryModel', () => {
  it('should render mesh', async () => {
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

  it('should render landmarks when selectedPoints are provided', async () => {
    // Resolve from project root
    const filePath = resolve(process.cwd(), 'playground/assets/bunny.bin.stl')
    expect(existsSync(filePath)).toBe(true)

    // Read file and convert to data URL
    const fileBuffer = readFileSync(filePath)
    const base64 = fileBuffer.toString('base64')
    const dataUrl = `data:application/octet-stream;base64,${base64}`

    // Create a list of selected points (landmarks) to be rendered on the mesh
    const selectedPoints: SelectedPoint[] = [
      {
        id: 1,
        position: new Vector3(0, 0, 0), // Center of mesh
      },
      {
        id: 2,
        position: new Vector3(1, 0, 0), // Right side
      },
      {
        id: 3,
        position: new Vector3(-1, 0, 0), // Left side
      },
      {
        id: 4,
        position: new Vector3(0, 1, 0), // Top
      },
    ]

    const renderer = await ReactThreeTestRenderer.create(
      <GeometryModel
        stlUrl={dataUrl}
        // onPointSelect={onPointSelect}
        selectedPoints={selectedPoints}
        editorState={'landmarks'}
        selectedLandmarkId={1}
        landmarksVisible={true}
      />,
    )

    // Wait for the model to load
    await renderer.advanceFrames(10, 1000)

    const landmarksGroup = renderer.scene.children[0].find(
      (child) => child.props.name === 'landmarks',
    )
    const landmarkItems = landmarksGroup?.children
    expect(landmarkItems).toBeDefined()
    expect(landmarkItems?.length).toBe(selectedPoints.length)

    for (const [i, selectedPoint] of selectedPoints.entries()) {
      const landmark = landmarkItems?.[i]
      expect(landmark).toBeDefined()
      expect(landmark?.props.name).toBe(`landmark-${selectedPoint.id}`)
      const position = (landmark as any).props?.position as Array<number>

      expect(position[0]).toBeCloseTo(selectedPoint.position.x) // x
      expect(position[1]).toBeCloseTo(selectedPoint.position.y) // y
      expect(position[2]).toBeCloseTo(selectedPoint.position.z) // z

      expect(landmark.instance.visible).toBe(true)
    }
  })
})
