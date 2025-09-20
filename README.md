# mesh-editor

[![Unit Test](https://github.com/mv740/mesh-editor/actions/workflows/test.yml/badge.svg)](https://github.com/mv740/mesh-editor/actions/workflows/unit-test.yml)

A powerful and interactive 3D mesh editor component for React. `mesh-editor` provides a comprehensive solution for viewing and manipulating 3D models directly in the browser.

## Features

- **3D Mesh Viewer**: Load and display 3D models in various formats.
- **Interactive 3D Mesh Editor**: A rich set of tools for mesh manipulation.
  - **State Management**: Undo/redo support for all editing operations (Ctrl+Z / Ctrl+Y).
  - **Landmarks**: Add, move, and delete landmarks on the mesh surface.
  - **Fill Holes**: Automatically detect and fill holes in the mesh.
  - **Clip Mesh**: Cut the mesh with a clipping plane.

## Usage

Here's a basic example of how to integrate the `MeshEditor` into your React application:

```tsx
import { MeshEditor } from 'mesh-editor'
import 'mesh-editor/dist/style.css'

function MyEditor() {
  const [file, setFile] = useState<File | null>(null)

  // Logic to load a file into the `file` state

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <MeshEditor title="My Mesh Editor" inputSettings={{ file }} />
    </div>
  )
}
```

## Development

- Install dependencies:

```bash
npm install
```

- Run the playground:

```bash
npm run playground
```

- Run the unit tests:

```bash
npm test
```

- Build the library:

```bash
npm run build
```
