import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { GeometryModel } from '@/components/editor/geometry-model'
import { MeshHistoryProvider } from '@/components/editor/history/mesh-history-provider'
import * as fileUtils from './file-utils'
import * as geomUtils from './geometry-utils'
import type { Scene } from 'three'

describe('GeometryUtils', () => {
  let dataUrl: string
  // let tempFolder: string
  beforeAll(() => {
    const filePath = resolve(
      process.cwd(),
      'playground/public/assets/bunny.bin.stl',
    )
    // Read file and convert to data URL
    const fileBuffer = readFileSync(filePath)
    const base64 = fileBuffer.toString('base64')
    dataUrl = `data:application/octet-stream;base64,${base64}`
  })

  afterEach(() => {
    cleanup()
  })

  test('export mesh to STL', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <MeshHistoryProvider>
        <GeometryModel stlUrl={dataUrl} />
      </MeshHistoryProvider>,
    )

    // wrap scene instance in a RefObject to match exportMesh signature
    const sceneRef: React.RefObject<Scene> = {
      current: renderer.scene.instance as unknown as Scene,
    }

    const safeFileSpy = vi
      .spyOn(fileUtils, 'saveFile')
      .mockImplementation((blob, filename) => {
        expect(blob).toBeInstanceOf(Blob)
        expect(filename).toMatch(/\.stl$/)
      })

    // export file to temporary location
    geomUtils.exportMesh(sceneRef, 1, 'stl')
    expect(safeFileSpy).toHaveBeenCalled()
  })
})
