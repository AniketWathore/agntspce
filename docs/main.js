document.addEventListener('DOMContentLoaded', () => {
  const links = document.querySelectorAll('.nav-link')
  const sections = document.querySelectorAll('.docs-content section')

  function updateActiveLink() {
    let current = ''
    sections.forEach(section => {
      const rect = section.getBoundingClientRect()
      if (rect.top <= 120) {
        current = section.getAttribute('id')
      }
    })
    links.forEach(link => {
      link.classList.remove('active')
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active')
      }
    })
  }

  window.addEventListener('scroll', updateActiveLink)
  updateActiveLink()

  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault()
      const targetId = link.getAttribute('href').slice(1)
      const target = document.getElementById(targetId)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  })
})
