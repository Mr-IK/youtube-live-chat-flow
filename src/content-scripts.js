import Logger from './utils/logger'
import Storage from './utils/storage'

const ClassName = {
  button: 'ylcf-button',
  message: 'ylcf-message'
}

let enabled = false
let settings
const data = []

const loadSettings = async () => {
  settings = (await Storage.get()).settings
}

const getColor = (authorType) => {
  switch (authorType) {
    case 'owner':
      return settings.ownerColor
    case 'moderator':
      return settings.moderatorColor
    case 'member':
      return settings.memberColor
    default:
      return settings.color
  }
}

const hasAuthority = (authorType) => {
  switch (authorType) {
    case 'owner':
    case 'moderator':
    case 'member':
      return true
    default:
      return false
  }
}

const createElement = (node, height) => {
  const tags = [
    'yt-live-chat-text-message-renderer',
    'yt-live-chat-paid-message-renderer'
  ]
  if (!tags.includes(node.tagName.toLowerCase())) {
    return
  }

  const authorType = node.getAttribute('author-type')
  const html = node.querySelector('#message').innerHTML
  const src = node.querySelector('#img').src
  const purchase = node.querySelector('#purchase-amount') && node.querySelector('#purchase-amount').innerText

  const fontSize = height * 0.8
  const color = purchase ? settings.paidColor : getColor(authorType)
  const authority = hasAuthority(authorType)

  const element = parent.document.createElement('div')
  element.classList.add(ClassName.message)
  element.setAttribute('style', `
    align-items: center;
    color: ${color};
    display: flex;
    font-size: ${fontSize}px;
    font-weight: bold;
    height: ${fontSize}px;
    left: 0;
    line-height: ${fontSize}px;
    position: absolute;
    text-shadow: ${settings.textShadow};
    vertical-align: bottom;
    white-space: nowrap;
  `)

  if (authority || purchase) {
    element.classList.add('has-auth')
    const img = parent.document.createElement('img')
    img.src = src
    img.setAttribute('style', `
      border-radius: ${fontSize}px;
      height: ${fontSize}px;
      margin-right: 0.2em;
      object-fit: cover;
    `)
    element.appendChild(img)
  }

  const span = parent.document.createElement('span')
  span.innerHTML = html
  Array.from(span.childNodes).map((node) => {
    if (!node.tagName || node.tagName.toLowerCase() !== 'img') {
      return node
    }
    node.setAttribute('style', `
      height: ${fontSize}px;
      vertical-align: bottom;
    `)
    return node
  })
  element.appendChild(span)

  if (purchase) {
    const textSize = fontSize * 0.5
    const span = parent.document.createElement('span')
    span.setAttribute('style', `
      font-size: ${textSize}px;
      line-height: initial;
      margin-left: 0.5em;
    `)
    span.innerText = purchase
    element.appendChild(span)
  }

  return element
}

const flow = (node) => {
  if (!enabled) {
    return
  }

  if (document.hidden) {
    return
  }

  const video = parent.document.querySelector('.video-stream.html5-main-video')
  if (video.paused) {
    return
  }

  const height = video.offsetHeight / settings.rows
  const element = createElement(node, height)
  if (!element) {
    return
  }

  const container = parent.document.querySelector('.html5-video-container')
  container.appendChild(element)

  const millis = settings.speed * 1000
  const keyframes = [
    { transform: `translate(${container.offsetWidth}px, 0px)` },
    { transform: `translate(-${element.offsetWidth}px, 0px)` }
  ]
  const animation = element.animate(keyframes, millis)

  const now = Date.now()
  const vc = (container.offsetWidth + element.offsetWidth) / millis

  let index = data.findIndex((messages) => {
    const message = messages[messages.length - 1]
    if (!message) {
      return true
    }
    const vt = (container.offsetWidth + message.element.offsetWidth) / millis

    const t1 = now - message.time
    const d1 = vt * t1
    if (d1 < message.element.offsetWidth) {
      return false
    }

    const t2 = t1 + container.offsetWidth / vc
    const d2 = vt * t2
    if (d2 < container.offsetWidth + message.element.offsetWidth) {
      return false
    }

    return true
  })

  const message = {
    element,
    animation,
    time: now
  }

  if (index === -1) {
    index = data.length
  }

  if (index > settings.rows - 1 && settings.overflow === 'hidden') {
    element.remove()
    return
  }

  if (!data[index]) {
    data[index] = []
  }
  data[index].push(message)

  const top = height * (0.1 + (index % settings.rows))
  const depth = element.classList.contains('has-auth') ? 0 : Math.floor(index / settings.rows)
  const opacity = settings.opacity ** (depth + 1)

  element.setAttribute('style', element.getAttribute('style') + `
    top: ${top}px;
    opacity: ${opacity};
  `)

  animation.onfinish = () => {
    element.remove()
    data[index].shift()
  }
}

const clearMessages = () => {
  Array.from(parent.document.querySelectorAll(`.${ClassName.message}`)).forEach((element) => {
    element.remove()
  })
}

const setupControlButton = (enabled) => {
  let button = parent.document.querySelector(`.${ClassName.button}`)
  if (!button) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z')
    path.setAttribute('fill', '#fff')

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '-8 -8 40 40')
    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    svg.append(path)

    button = document.createElement('button')
    button.classList.add(ClassName.button)
    button.classList.add('ytp-button')
    button.onclick = () => {
      chrome.runtime.sendMessage({ id: 'controlButtonClicked' })
    }
    button.append(svg)

    const controls = parent.document.querySelector('.ytp-right-controls')
    controls.prepend(button)
  }
  button.setAttribute('aria-pressed', enabled)
}

const removeControlButton = () => {
  parent.document.querySelector(`.${ClassName.button}`).remove()
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  Logger.log('chrome.runtime.onMessage', message, sender, sendResponse)

  const { id, data } = message
  switch (id) {
    case 'enabledChanged':
      enabled = data.enabled
      setupControlButton(enabled)
      if (!enabled) {
        clearMessages()
      }
      break
    case 'stateChanged':
      await loadSettings()
      break
  }
})

;(() => {
  Logger.log('content script loaded')

  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings()

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const nodes = Array.from(mutation.addedNodes)
        nodes.forEach((node) => {
          flow(node)
        })
      })
    })
    const items = document.querySelector('#items.yt-live-chat-item-list-renderer')
    observer.observe(items, { childList: true })

    const callback = (e) => {
      data.reduce((carry, messages) => [...carry, ...messages.map((message) => message.animation)], [])
        .forEach((animation) => animation[e.type]())
    }
    const video = parent.document.querySelector('.video-stream.html5-main-video')
    video.addEventListener('pause', callback)
    video.addEventListener('play', callback)

    chrome.runtime.sendMessage({ id: 'contentLoaded' })

    window.addEventListener('unload', () => {
      clearMessages()

      video.removeEventListener('pause', callback)
      video.removeEventListener('play', callback)

      observer.disconnect()

      removeControlButton()
    })
  })
})()
