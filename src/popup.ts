// Redirect target for pop-up sign-in (used only when To Do's runs inside the HLWT Hub).
// Hands Microsoft's response back to the window that opened the pop-up; MSAL closes it.
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge'

broadcastResponseToMainFrame().catch(() => {
  document.body.textContent = 'Sign-in could not finish. Close this window and try again.'
})
