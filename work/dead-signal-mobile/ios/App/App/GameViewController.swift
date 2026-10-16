import UIKit
import WebKit
import Capacitor

@objc(OfflineNavigationGuard)
final class OfflineNavigationGuard: CAPPlugin, CAPBridgedPlugin {
    let identifier = "OfflineNavigationGuard"
    let jsName = "OfflineNavigationGuard"
    let pluginMethods: [CAPPluginMethod] = []

    override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        // Return nil for trusted pages so Capacitor can apply its normal checks.
        return OfflineURLPolicy.allows(navigationAction.request.url) ? nil : NSNumber(value: true)
    }
}

final class GameViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(OfflineNavigationGuard())
        webView?.allowsBackForwardNavigationGestures = false
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        webView?.scrollView.alwaysBounceHorizontal = false
        webView?.scrollView.pinchGestureRecognizer?.isEnabled = false
        if #available(iOS 16.4, *) { webView?.isInspectable = false }
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        return UIDevice.current.userInterfaceIdiom == .pad
            ? .all
            : [.portrait, .landscapeLeft, .landscapeRight]
    }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }
}
