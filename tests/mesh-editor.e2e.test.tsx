import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { MeshEditor } from '../src'

test('renders name', async () => {
  const { getByTestId } = render(
    <div className="m-8 dark">
      <MeshEditor title="InputTitle" description="InputDescription" />
    </div>,
  )
  const title = await getByTestId('card-title')
  expect(title).toHaveTextContent('InputTitle')

  const description = await getByTestId('card-description')
  expect(description).toHaveTextContent('InputDescription')
})
