import { expect, test, type Page } from '@playwright/test'

type StaticDemoSnapshot = {
  currentFile: string
  currentLayout: string
  nodeCount: number
  edgeCount: number
  statusLevel: string
  backend: string | null
}

declare global {
  interface Window {
    __MERMAID_DEV__?: {
      snapshot(): StaticDemoSnapshot
      clickLink(nodeId: string): boolean
    }
  }
}

async function waitForDevApi(page: Page) {
  await expect.poll(async () => {
    return await page.evaluate(() => Boolean(window.__MERMAID_DEV__?.snapshot))
  }).toBe(true)
}

async function snapshot(page: Page): Promise<StaticDemoSnapshot> {
  return await page.evaluate(() => window.__MERMAID_DEV__!.snapshot())
}

test('renders and navigates in the built static demo artifact', async ({ page }) => {
  await page.goto('/')
  await waitForDevApi(page)

  await expect(page.locator('#canvas')).toBeVisible()
  await expect.poll(async () => await page.locator('#files button').count()).toBeGreaterThan(5)
  await expect(page.locator('#files button[data-file="/examples/microservice/overview.mmd"]')).toBeVisible()
  await expect(page.locator('#files button[data-file="/examples/simple-flow.mmd"]')).toBeVisible()
  await expect(page.locator('#controls button[data-layout="blueprint"]')).toBeVisible()

  await expect.poll(async () => (await snapshot(page)).currentFile)
    .toBe('/examples/microservice/overview.mmd')

  const initial = await snapshot(page)
  expect(initial.nodeCount).toBeGreaterThan(0)
  expect(initial.edgeCount).toBeGreaterThan(0)
  expect(initial.statusLevel).not.toBe('error')
  expect(initial.backend).toMatch(/WebGL|WebGPU/)

  await page.locator('#controls button[data-layout="blueprint"]').click()
  await expect.poll(async () => (await snapshot(page)).currentLayout).toBe('blueprint')

  const navigated = await page.evaluate(() => window.__MERMAID_DEV__!.clickLink('OrderSvc'))
  expect(navigated).toBe(true)
  await expect.poll(async () => (await snapshot(page)).currentFile)
    .toBe('/examples/microservice/order-service.mmd')

  const afterLink = await snapshot(page)
  expect(afterLink.nodeCount).toBeGreaterThan(0)
  expect(afterLink.statusLevel).not.toBe('error')

  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('#files button[data-file="/examples/simple-flow.mmd"]')
    if (!button) throw new Error('Missing simple-flow file button in built demo')
    button.click()
  })
  await expect.poll(async () => (await snapshot(page)).currentFile)
    .toBe('/examples/simple-flow.mmd')

  const afterFilePick = await snapshot(page)
  expect(afterFilePick.nodeCount).toBeGreaterThan(0)
  expect(afterFilePick.statusLevel).not.toBe('error')
})
