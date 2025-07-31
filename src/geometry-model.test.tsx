import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { cleanup } from '@testing-library/react'
import { Vector3 } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { GeometryModel } from './components/editor/geometry-model'
import type { SelectedPoint } from './components/editor/type'

describe('GeometryModel', () => {
  afterEach(() => {
    cleanup()
  })

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
    // group has 2 children
    expect(graph?.[0].children?.length).toBe(2)
    // first child is a mesh
    expect(graph?.[0].children?.[0].type).toBe('Mesh')
    // first child has a name
    const inputMeshData = renderer.scene.children[0].children[0].instance
    expect(inputMeshData).toBeDefined()
    expect(inputMeshData.name).toBe('inputMesh')
    expect(inputMeshData?.name).toBe('inputMesh')
    // is visible
    expect(inputMeshData.visible).toBe(true)
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
        normal: new Vector3(0, 0, 1), // Normal pointing outwards
      },
      {
        id: 2,
        position: new Vector3(1, 0, 0), // Right side
        normal: new Vector3(0, 0, 1),
      },
      {
        id: 3,
        position: new Vector3(-1, 0, 0), // Left side
        normal: new Vector3(0, 0, 1),
      },
      {
        id: 4,
        position: new Vector3(0, 1, 0), // Top
        normal: new Vector3(0, 0, 1),
      },
    ]

    const renderer = await ReactThreeTestRenderer.create(
      <GeometryModel
        stlUrl={dataUrl}
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
      expect(landmark?.type).toBe('Group')
      expect(landmark?.props?.name).toBe(`landmark-group-${selectedPoint.id}`)

      // Get the mesh (first child of the group)
      const landmarkMesh = landmark?.children?.[0]
      expect(landmarkMesh).toBeDefined()
      expect(landmarkMesh?.type).toBe('Mesh')
      expect(landmarkMesh?.props?.name).toBe(`landmark-${selectedPoint.id}`)

      // Compare the mesh position with the selected point
      const position = (landmarkMesh as any).props?.position as Array<number>
      expect(position[0]).toBeCloseTo(selectedPoint.position.x)
      expect(position[1]).toBeCloseTo(selectedPoint.position.y)
      expect(position[2]).toBeCloseTo(selectedPoint.position.z)

      expect(landmark.instance.visible).toBe(true)
    }
  })

  it('should add a landmark at the clicked position on the mesh', async () => {
    const filePath = resolve(process.cwd(), 'playground/assets/bunny.bin.stl')
    expect(existsSync(filePath)).toBe(true)
    const fileBuffer = readFileSync(filePath)
    const base64 = fileBuffer.toString('base64')
    const dataUrl = `data:application/octet-stream;base64,${base64}`

    const selectedPoints: SelectedPoint[] = []

    const handlePointSelect = (
      point: Vector3,
      normal: Vector3,
      // eslint-disable-next-line unused-imports/no-unused-vars
      _landmarkIdToMove?: number,
    ) => {
      selectedPoints.push({
        id: selectedPoints.length + 1,
        position: point,
        normal,
      })
    }

    const renderer = await ReactThreeTestRenderer.create(
      <GeometryModel
        stlUrl={dataUrl}
        selectedPoints={selectedPoints}
        onPointSelect={handlePointSelect}
        editorState={'landmarks'}
        landmarksVisible={true}
      />,
    )

    await renderer.advanceFrames(10, 1000)

    const meshNode = renderer.scene.children[0].find(
      (child) => child.type === 'Mesh',
    )
    expect(meshNode).toBeDefined()

    // Correct way to fire event: use camelCase event name
    await renderer.fireEvent(meshNode, 'onDoubleClick', {
      point: new Vector3(5, 6, 7),
      normal: new Vector3(0, 1, 0),
    })

    expect(selectedPoints.length).toBe(1)
    expect(selectedPoints[0].position.x).toBeCloseTo(5)
    expect(selectedPoints[0].position.y).toBeCloseTo(6)
    expect(selectedPoints[0].position.z).toBeCloseTo(7)
    expect(selectedPoints[0].normal.x).toBeCloseTo(0)
    expect(selectedPoints[0].normal.y).toBeCloseTo(1)
    expect(selectedPoints[0].normal.z).toBeCloseTo(0)
  })
})
