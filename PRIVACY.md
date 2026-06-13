# Privacy Policy for TabFrost

**Effective Date:** June 11, 2026

TabFrost ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains our practices regarding data collection, usage, and security for the TabFrost browser extension.

## 1. No Data Collection
TabFrost operates under a strict **Zero Data Collection** policy. 
* We do not collect, store, transmit, or sell any personally identifiable information, browsing history, financial data, or authentication credentials.
* Your web browsing activity, tab URLs, and session details are processed entirely on your local machine and never leave your device.

## 2. Explanation of Requested Permissions
TabFrost requests specific browser permissions solely to deliver its core functionality. These permissions are used as follows:
* **`tabs`:** Used to detect active and inactive tab states for the auto-suspension timer and to capture the active tab layout when you explicitly choose to save a session. No browsing logs or history are created or tracked.
* **`storage`:** Used strictly to save your named tab session layouts locally using the `chrome.storage.local` API so you can restore them later. 
* **`alarms`:** Used to run a safe background timer that counts 30 minutes of tab inactivity to trigger the automated tab-freezing feature.

## 3. Data Protection and Security
Because all your data is stored locally within your browser's sandboxed environment, its security depends entirely on your local device. TabFrost does not use external cloud servers or remote databases, eliminating the risk of server-side data leaks or breaches.

## 4. No Remote Code Execution
In strict compliance with modern Manifest V3 security requirements, TabFrost does not execute or load any remote code. All application logic runs entirely from within the secure, uploaded extension package.

## 5. Compliance with Google Developer Policies
We certify that TabFrost fully complies with the Chrome Web Store Developer Program Policies, including the Single Purpose rule and the Limited Use requirements.

## 6. Changes to This Policy
We may update this Privacy Policy from time to time to reflect modifications to our extension. Any updates will be posted on this official page.

## 7. Contact Us
If you have any questions or bug reports regarding this Privacy Policy, please open an issue on our official support page:
https://github.com
