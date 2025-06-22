import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Button } from '../src/index.js'

test('renders name', async () => {
  const { getByText } = render(<Button>Hello Vitest!</Button>)
  await expect.element(getByText('Hello Vitest!')).toBeInTheDocument()
})
