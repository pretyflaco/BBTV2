/**
 * Type definitions for non-standard Navigator APIs
 *
 * - navigator.standalone: Safari iOS PWA detection (non-standard)
 * - navigator.getInstalledRelatedApps(): Installed Related Apps API
 */

interface Navigator {
  /**
   * Safari iOS: indicates whether the app is running in standalone (PWA) mode
   * Non-standard property, only available in Safari on iOS
   */
  standalone?: boolean

  /**
   * Returns a list of related native/web apps installed on the device
   * https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getInstalledRelatedApps
   */
  getInstalledRelatedApps?(): Promise<
    Array<{
      id?: string
      platform: string
      url?: string
      version?: string
    }>
  >
}
