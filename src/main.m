#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <Security/Security.h>
#import <UserNotifications/UserNotifications.h>

// Keychain item that holds the Discord token (generic password in the login keychain)
static NSString * const DLKeychainService = @"com.sidney.DiscordLight";
static NSString * const DLKeychainAccount = @"discord-token";

static inline NSString *SafeString(id val) {
    if (!val || val == [NSNull null] || ![val isKindOfClass:[NSString class]]) {
        return @"";
    }
    return (NSString *)val;
}

// JSON text is spliced into scripts handed to evaluateJavaScript:. NSJSONSerialization leaves U+2028 / U+2029 raw
// inside strings; JavaScript engines older than ES2019 treat them as line terminators, which breaks the script.
static inline NSString *JSSafeJSON(NSString *json) {
    json = [json stringByReplacingOccurrencesOfString:@"\u2028" withString:@"\\u2028"];
    return [json stringByReplacingOccurrencesOfString:@"\u2029" withString:@"\\u2029"];
}

// Touch Bar Identifiers
static NSTouchBarItemIdentifier const TBItemIdentifierLogo = @"com.discordlight.touchbar.logo";
static NSTouchBarItemIdentifier const TBItemIdentifierChannelTitle = @"com.discordlight.touchbar.channel";
static NSTouchBarItemIdentifier const TBItemIdentifierAgentsPopover = @"com.discordlight.touchbar.agents_popover";
static NSString * const TBItemIdentifierPopoverBotPrefix = @"com.discordlight.touchbar.popover.bot";
static NSString * const TBItemIdentifierBotPrefix = @"com.discordlight.touchbar.bot";
static NSTouchBarItemIdentifier const TBItemIdentifierMembersPopover = @"com.discordlight.touchbar.members_popover";
static NSString * const TBItemIdentifierPopoverMemberPrefix = @"com.discordlight.touchbar.popover.member";
static NSTouchBarItemIdentifier const TBItemIdentifierChannelsPopover = @"com.discordlight.touchbar.channels_popover";
static NSString * const TBItemIdentifierPopoverPinPrefix = @"com.discordlight.touchbar.popover.pin";
static NSString * const TBItemIdentifierPinPrefix = @"com.discordlight.touchbar.pin";
static NSTouchBarItemIdentifier const TBItemIdentifierRefresh = @"com.discordlight.touchbar.refresh";

// Invisible strip over the sidebar's top edge. With a full-size content view the
// title bar is gone, and WKWebView swallows mouse-downs, so this view hands the
// drag back to the window (and keeps double-click-to-zoom like a real title bar).
@interface DLDragStripView : NSView
@end

@implementation DLDragStripView
- (BOOL)mouseDownCanMoveWindow { return YES; }
- (void)mouseDown:(NSEvent *)event {
    if (event.clickCount == 2) {
        [self.window performZoom:nil];
        return;
    }
    [self.window performWindowDragWithEvent:event];
}
@end

@interface AppDelegate : NSResponder <NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, NSTouchBarDelegate, UNUserNotificationCenterDelegate>
@property (nonatomic, strong) NSWindow *window;
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) NSString *token;
@property (nonatomic, strong) NSString *configPath;
@property (nonatomic, strong) NSMutableDictionary *config;
@property (nonatomic, strong) NSURLSession *session;
@property (nonatomic, strong) NSString *currentChannelId;
@property (nonatomic, strong) NSString *currentChannelName;
@property (nonatomic, strong) NSArray *currentBots;
@property (nonatomic, strong) NSArray *currentMembers;
@property (nonatomic, strong) NSArray *currentPinned;
@property (nonatomic, strong) NSMutableDictionary *channelGuildCache;
@end

@implementation AppDelegate

- (void)setupMainMenu {
    NSMenu *mainMenu = [[NSMenu alloc] init];
    
    // 1. Application Menu
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    NSMenu *appMenu = [[NSMenu alloc] init];
    [appMenu addItemWithTitle:@"About DiscordLight" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Hide DiscordLight" action:@selector(hide:) keyEquivalent:@"h"];
    NSMenuItem *hideOthers = [appMenu addItemWithTitle:@"Hide Others" action:@selector(hideOtherApplications:) keyEquivalent:@"h"];
    [hideOthers setKeyEquivalentModifierMask:NSEventModifierFlagOption | NSEventModifierFlagCommand];
    [appMenu addItemWithTitle:@"Show All" action:@selector(unhideAllApplications:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Quit DiscordLight" action:@selector(terminate:) keyEquivalent:@"q"];
    [appMenuItem setSubmenu:appMenu];
    [mainMenu addItem:appMenuItem];
    
    // 2. Edit Menu (Cmd+C, Cmd+V, Cmd+A, Cmd+X, Cmd+Z)
    NSMenuItem *editMenuItem = [[NSMenuItem alloc] init];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
    [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
    [editMenu addItemWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
    [editMenuItem setSubmenu:editMenu];
    [mainMenu addItem:editMenuItem];
    
    // 3. Window Menu
    NSMenuItem *windowMenuItem = [[NSMenuItem alloc] init];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
    [windowMenu addItemWithTitle:@"Minimize" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    [windowMenu addItemWithTitle:@"Zoom" action:@selector(performZoom:) keyEquivalent:@""];
    [windowMenu addItem:[NSMenuItem separatorItem]];
    [windowMenu addItemWithTitle:@"Bring All to Front" action:@selector(arrangeInFront:) keyEquivalent:@""];
    [windowMenuItem setSubmenu:windowMenu];
    [mainMenu addItem:windowMenuItem];
    
    [NSApp setMainMenu:mainMenu];
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self setupMainMenu];

    // Dynamic Dock icon loading
    NSString *iconPath = [[NSBundle mainBundle] pathForResource:@"AppIcon" ofType:@"icns"];
    if (iconPath) {
        NSImage *iconImg = [[NSImage alloc] initWithContentsOfFile:iconPath];
        if (iconImg) {
            [NSApp setApplicationIconImage:iconImg];
        }
    }

    // 1. Safe Config Loading (NO hardcoded credentials)
    NSString *home = NSHomeDirectory();
    NSString *legacyDir = [home stringByAppendingPathComponent:@".config/discord_lite"];
    NSString *newDir = [home stringByAppendingPathComponent:@".config/discordlight"];
    [[NSFileManager defaultManager] createDirectoryAtPath:newDir withIntermediateDirectories:YES attributes:nil error:nil];
    
    self.configPath = [newDir stringByAppendingPathComponent:@"config.json"];
    if (![[NSFileManager defaultManager] fileExistsAtPath:self.configPath]) {
        NSString *legacyPath = [legacyDir stringByAppendingPathComponent:@"config.json"];
        if ([[NSFileManager defaultManager] fileExistsAtPath:legacyPath]) {
            self.configPath = legacyPath;
        }
    }
    
    self.config = [NSMutableDictionary dictionary];
    if ([[NSFileManager defaultManager] fileExistsAtPath:self.configPath]) {
        NSData *d = [NSData dataWithContentsOfFile:self.configPath];
        NSDictionary *parsed = [NSJSONSerialization JSONObjectWithData:d options:0 error:nil];
        if (parsed) [self.config addEntriesFromDictionary:parsed];
    }
    
    // Discover the token: DISCORD_TOKEN env (development, never touches the Keychain) -> Keychain -> legacy config.json
    NSString *envToken = SafeString([[[NSProcessInfo processInfo] environment] objectForKey:@"DISCORD_TOKEN"]);
    if (envToken.length > 0) {
        self.token = envToken;
    } else {
        NSString *storedToken = [AppDelegate keychainToken];
        NSString *legacyToken = SafeString(self.config[@"token"]);
        if (storedToken.length == 0 && legacyToken.length > 0 && [AppDelegate storeKeychainToken:legacyToken]) {
            storedToken = legacyToken; // moved from the plaintext config file into the Keychain
        }
        if (storedToken.length > 0) {
            self.token = storedToken;
            if (self.config[@"token"]) {
                // The Keychain holds the token now: config.json must no longer contain it
                [self.config removeObjectForKey:@"token"];
                [self saveConfig];
            }
        } else {
            // Keychain unavailable (access denied): keep using the legacy file token, retry the move next launch
            self.token = legacyToken;
        }
    }

    NSURLSessionConfiguration *sconfig = [NSURLSessionConfiguration defaultSessionConfiguration];
    sconfig.timeoutIntervalForRequest = 10.0;
    self.session = [NSURLSession sessionWithConfiguration:sconfig];
    self.channelGuildCache = [NSMutableDictionary dictionary];

    // 2. Setup WKWebView & Native Bridge
    WKWebViewConfiguration *webConfig = [[WKWebViewConfiguration alloc] init];
    WKUserContentController *userContent = [[WKUserContentController alloc] init];
    [userContent addScriptMessageHandler:self name:@"discordBridge"];
    webConfig.userContentController = userContent;
    [webConfig.preferences setValue:@YES forKey:@"developerExtrasEnabled"];

    // 3. Create Modern Window
    NSRect frame = NSMakeRect(120, 100, 1120, 740);
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable | NSWindowStyleMaskFullSizeContentView)
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    self.window.title = @"DiscordLight";
    self.window.minSize = NSMakeSize(760, 500);
    self.window.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    self.window.titlebarAppearsTransparent = YES;
    self.window.titleVisibility = NSWindowTitleHidden;
    self.window.delegate = self; // occlusion changes set the web layer's poll interval (windowDidChangeOcclusionState:)
    self.window.releasedWhenClosed = NO; // the delegate keeps a strong reference; required under ARC
    [self.window center];

    self.webView = [[WKWebView alloc] initWithFrame:self.window.contentView.bounds configuration:webConfig];
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    [self.window.contentView addSubview:self.webView];

    // Drag strip: sidebar width (240) x the 38pt traffic-light band at the top.
    // Matches .sidebar-header's padding-top in style.css; nothing interactive lives there.
    NSRect contentBounds = self.window.contentView.bounds;
    DLDragStripView *dragStrip = [[DLDragStripView alloc] initWithFrame:NSMakeRect(0, NSMaxY(contentBounds) - 38, 240, 38)];
    dragStrip.autoresizingMask = NSViewMinYMargin;
    [self.window.contentView addSubview:dragStrip positioned:NSWindowAbove relativeTo:self.webView];

    // 4. Load Web Interface
    NSURL *webURL = [[NSBundle mainBundle] URLForResource:@"index" withExtension:@"html" subdirectory:@"web"];
    if (!webURL) {
        // Local directory fallback for development
        NSString *localPath = [NSString stringWithFormat:@"%@/Developer/projects/DiscordLight/web/index.html", home];
        if ([[NSFileManager defaultManager] fileExistsAtPath:localPath]) {
            webURL = [NSURL fileURLWithPath:localPath];
        } else {
            webURL = [NSURL fileURLWithPath:@"/Users/xu/.gemini/antigravity/scratch/DiscordLite/web/index.html"];
        }
    }
    
    if (webURL) {
        [self.webView loadFileURL:webURL allowingReadAccessToURL:[webURL URLByDeletingLastPathComponent]];
    }

    self.window.touchBar = [self makeTouchBar];

    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    [self setupNotifications];

    // Debug automation hook (eval / snapshot via a distributed notification). Any local process can post that
    // notification, so the observer only exists when the app is launched with DISCORDLIGHT_DEBUG set (non-empty).
    const char *debugFlag = getenv("DISCORDLIGHT_DEBUG");
    if (debugFlag && debugFlag[0] != '\0') {
        [[NSDistributedNotificationCenter defaultCenter] addObserver:self
                                                             selector:@selector(handleTestNotification:)
                                                                 name:@"com.discordlight.test"
                                                               object:nil];
    }
}

// Only registered when DISCORDLIGHT_DEBUG is set (see applicationDidFinishLaunching:)
- (void)handleTestNotification:(NSNotification *)note {
    NSString *obj = SafeString(note.object);
    if ([obj hasPrefix:@"eval:"]) {
        NSString *js = [obj substringFromIndex:5];
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.webView evaluateJavaScript:js completionHandler:nil];
        });
    } else if ([obj isEqualToString:@"snapshot"]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.webView takeSnapshotWithConfiguration:nil completionHandler:^(NSImage *snapshot, NSError *error) {
                if (snapshot) {
                    NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:[snapshot TIFFRepresentation]];
                    NSData *png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
                    [png writeToFile:@"/tmp/discordlight_webview_snapshot.png" atomically:YES];
                }
            }];
        });
    }
}

- (void)saveConfig {
    NSData *d = [NSJSONSerialization dataWithJSONObject:self.config options:NSJSONWritingPrettyPrinted error:nil];
    [d writeToFile:self.configPath atomically:YES];
}

#pragma mark - Keychain (token storage)

// Classic file-based keychain API (no kSecUseDataProtectionKeychain): needs no entitlement and no signing identity.
// An ad-hoc signed build changes with every rebuild, so macOS asks again for keychain access after each rebuild.
+ (NSDictionary *)keychainQuery {
    return @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: DLKeychainService,
        (__bridge id)kSecAttrAccount: DLKeychainAccount
    };
}

+ (NSString *)keychainToken {
    NSMutableDictionary *query = [[self keychainQuery] mutableCopy];
    query[(__bridge id)kSecReturnData] = @YES;
    query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    NSData *data = (__bridge_transfer NSData *)result; // ARC owns the returned CFData (nil when nothing was found)
    if (status != errSecSuccess || ![data isKindOfClass:[NSData class]] || data.length == 0) return nil;
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

+ (BOOL)storeKeychainToken:(NSString *)token {
    if (token.length == 0) return NO;
    NSData *data = [token dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *query = [self keychainQuery];
    OSStatus status = SecItemUpdate((__bridge CFDictionaryRef)query, (__bridge CFDictionaryRef)@{(__bridge id)kSecValueData: data});
    if (status == errSecItemNotFound) {
        NSMutableDictionary *item = [query mutableCopy];
        item[(__bridge id)kSecValueData] = data;
        status = SecItemAdd((__bridge CFDictionaryRef)item, NULL);
    }
    return status == errSecSuccess;
}

+ (void)deleteKeychainToken {
    SecItemDelete((__bridge CFDictionaryRef)[self keychainQuery]);
}

- (NSMutableURLRequest *)requestWithURLString:(NSString *)urlStr method:(NSString *)method {
    NSURL *url = [NSURL URLWithString:urlStr];
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    [req setHTTPMethod:method];
    if (self.token.length > 0) {
        [req setValue:self.token forHTTPHeaderField:@"Authorization"];
    }
    [req setValue:@"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" forHTTPHeaderField:@"User-Agent"];
    [req setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    return req;
}

- (void)respondToJS:(NSString *)callback data:(NSDictionary *)data {
    // The callback name is spliced into the script as an identifier, so it may only be letters, digits and "_"
    // (callNative() in app.js generates "cb_" + base36).
    // NOTE: built with -fobjc-arc (see Makefile); keep it that way, the file has no manual retain/release.
    NSCharacterSet *notIdentifier = [[NSCharacterSet characterSetWithCharactersInString:@"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"] invertedSet];
    if (callback.length == 0 || [callback rangeOfCharacterFromSet:notIdentifier].location != NSNotFound) return;

    NSError *err = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:data options:0 error:&err];
    NSString *jsonStr = jsonData ? [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding] : nil;
    NSString *js = [NSString stringWithFormat:@"window.%@(%@);", callback, jsonStr ? JSSafeJSON(jsonStr) : @"{}"];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.webView evaluateJavaScript:js completionHandler:nil];
    });
}

// Native Bridge Dispatcher
- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.body isKindOfClass:[NSDictionary class]]) return;
    NSDictionary *body = (NSDictionary *)message.body;
    NSString *action = SafeString(body[@"action"]);
    NSString *callback = SafeString(body[@"callback"]);

    if ([action isEqualToString:@"getConfig"]) {
        NSMutableDictionary *safeConf = [NSMutableDictionary dictionaryWithDictionary:self.config];
        // The token never crosses the bridge: the web layer only needs to know whether one exists
        [safeConf removeObjectForKey:@"token"];
        safeConf[@"hasToken"] = @(self.token.length > 0);
        [self respondToJS:callback data:safeConf];
    }
    else if ([action isEqualToString:@"saveConfig"]) {
        if (body[@"token"]) {
            // The token goes to the Keychain only, never into config.json
            self.token = SafeString(body[@"token"]);
            if (self.token.length > 0) {
                [AppDelegate storeKeychainToken:self.token]; // if access is denied, the token still works for this session
            } else {
                [AppDelegate deleteKeychainToken];
            }
            [self.config removeObjectForKey:@"token"];
        }
        if (body[@"pinned_channels"]) self.config[@"pinned_channels"] = body[@"pinned_channels"];
        if (body[@"last_channel_id"]) self.config[@"last_channel_id"] = body[@"last_channel_id"];
        // Sidebar UI state (collapsed sections)
        if ([body[@"ui"] isKindOfClass:[NSDictionary class]]) self.config[@"ui"] = body[@"ui"];
        [self saveConfig];
        [self respondToJS:callback data:@{@"success": @YES}];
    }
    else if ([action isEqualToString:@"clearToken"]) {
        // Log out: forget the stored token (a DISCORD_TOKEN env var still applies on the next launch)
        [AppDelegate deleteKeychainToken];
        self.token = @"";
        if (self.config[@"token"]) {
            [self.config removeObjectForKey:@"token"];
            [self saveConfig];
        }
        [self respondToJS:callback data:@{@"success": @YES}];
    }
    else if ([action isEqualToString:@"fetchCurrentUser"]) {
        NSMutableURLRequest *req = [self requestWithURLString:@"https://discord.com/api/v10/users/@me" method:@"GET"];
        [[self.session dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
            id obj = (data && !err) ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
            if ([obj isKindOfClass:[NSDictionary class]]) {
                [self respondToJS:callback data:@{@"user": obj}];
            } else {
                [self respondToJS:callback data:@{@"error": @"Failed to fetch user profile"}];
            }
        }] resume];
    }
    else if ([action isEqualToString:@"fetchGuilds"]) {
        NSMutableURLRequest *req = [self requestWithURLString:@"https://discord.com/api/v10/users/@me/guilds" method:@"GET"];
        [[self.session dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
            id obj = (data && !err) ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
            NSArray *arr = [obj isKindOfClass:[NSArray class]] ? (NSArray *)obj : @[];
            [self respondToJS:callback data:@{@"guilds": arr}];
        }] resume];
    }
    else if ([action isEqualToString:@"fetchGuildChannels"]) {
        NSString *guildId = SafeString(body[@"guildId"]);
        NSString *url = [NSString stringWithFormat:@"https://discord.com/api/v10/guilds/%@/channels", guildId];
        NSMutableURLRequest *req = [self requestWithURLString:url method:@"GET"];
        [[self.session dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
            id obj = (data && !err) ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
            NSArray *arr = [obj isKindOfClass:[NSArray class]] ? (NSArray *)obj : @[];
            for (NSDictionary *c in arr) {
                NSString *cid = SafeString(c[@"id"]);
                if (cid.length > 0 && guildId.length > 0) {
                    self.channelGuildCache[cid] = guildId;
                }
            }
            [self respondToJS:callback data:@{@"channels": arr}];
        }] resume];
    }
    else if ([action isEqualToString:@"fetchDMs"]) {
        NSMutableURLRequest *req = [self requestWithURLString:@"https://discord.com/api/v10/users/@me/channels" method:@"GET"];
        [[self.session dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
            id obj = (data && !err) ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
            NSArray *arr = [obj isKindOfClass:[NSArray class]] ? (NSArray *)obj : @[];
            [self respondToJS:callback data:@{@"dms": arr}];
        }] resume];
    }
    else if ([action isEqualToString:@"fetchMessages"]) {
        NSString *channelId = SafeString(body[@"channelId"]);
        int limit = [body[@"limit"] intValue] ?: 30;
        NSString *url = [NSString stringWithFormat:@"https://discord.com/api/v10/channels/%@/messages?limit=%d", channelId, limit];
        // Incremental poll: only messages newer than this snowflake id. ASCII digits only, anything else is ignored.
        NSString *after = SafeString(body[@"after"]);
        NSCharacterSet *notDigit = [[NSCharacterSet characterSetWithCharactersInString:@"0123456789"] invertedSet];
        // Scroll-back page: only messages older than this snowflake id, same rule. Discord takes one of after / before,
        // so `before` is used only when no valid `after` was given.
        NSString *before = SafeString(body[@"before"]);
        if (after.length > 0 && after.length <= 20 && [after rangeOfCharacterFromSet:notDigit].location == NSNotFound) {
            url = [url stringByAppendingFormat:@"&after=%@", after];
        } else if (before.length > 0 && before.length <= 20 && [before rangeOfCharacterFromSet:notDigit].location == NSNotFound) {
            url = [url stringByAppendingFormat:@"&before=%@", before];
        }
        NSMutableURLRequest *req = [self requestWithURLString:url method:@"GET"];
        [[self.session dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
            id obj = (data && !err) ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
            if ([obj isKindOfClass:[NSArray class]]) {
                [self respondToJS:callback data:@{@"messages": (NSArray *)obj}];
            } else {
                [self respondToJS:callback data:@{@"messages": @[], @"error": SafeString(obj[@"message"])}];
            }
        }] resume];
    }
    else if ([action isEqualToString:@"sendMessage"]) {
        NSString *channelId = SafeString(body[@"channelId"]);
        NSString *content = SafeString(body[@"content"]);
        NSString *url = [NSString stringWithFormat:@"https://discord.com/api/v10/channels/%@/messages", channelId];
        NSMutableURLRequest *req = [self requestWithURLString:url method:@"POST"];
        req.HTTPBody = [NSJSONSerialization dataWithJSONObject:@{@"content": content} options:0 error:nil];
        [[self.session dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
            NSHTTPURLResponse *hresp = (NSHTTPURLResponse *)resp;
            BOOL ok = (err == nil && hresp.statusCode >= 200 && hresp.statusCode < 300);
            [self respondToJS:callback data:@{@"success": @(ok)}];
        }] resume];
    }
    else if ([action isEqualToString:@"sendInteraction"]) {
        // True Discord Component Button Interaction
        NSString *appId = SafeString(body[@"applicationId"]);
        NSString *channelId = SafeString(body[@"channelId"]);
        NSString *messageId = SafeString(body[@"messageId"]);
        NSString *customId = SafeString(body[@"customId"]);

        void (^executeInteraction)(NSString *guildId) = ^(NSString *guildId) {
            uint64_t now_ms = (uint64_t)([[NSDate date] timeIntervalSince1970] * 1000.0);
            uint64_t nonce_val = (now_ms - 1420070400000ULL) << 22;
            NSString *nonce = [NSString stringWithFormat:@"%llu", nonce_val];
            NSString *sessionId = [[NSUUID UUID].UUIDString stringByReplacingOccurrencesOfString:@"-" withString:@""].lowercaseString;

            NSMutableDictionary *payload = [NSMutableDictionary dictionaryWithDictionary:@{
                @"type": @3,
                @"nonce": nonce,
                @"channel_id": channelId,
                @"message_id": messageId,
                @"application_id": appId,
                @"data": @{
                    @"component_type": @2,
                    @"custom_id": customId
                },
                @"session_id": sessionId
            }];
            if (guildId.length > 0) {
                payload[@"guild_id"] = guildId;
            }

            NSMutableURLRequest *req = [self requestWithURLString:@"https://discord.com/api/v10/interactions" method:@"POST"];
            req.HTTPBody = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
            [[self.session dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
                NSHTTPURLResponse *hresp = (NSHTTPURLResponse *)resp;
                BOOL ok = (err == nil && hresp.statusCode >= 200 && hresp.statusCode < 300);
                NSString *errorMsg = nil;
                if (!ok && data) {
                    NSDictionary *errObj = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
                    if ([errObj isKindOfClass:[NSDictionary class]]) {
                        errorMsg = SafeString(errObj[@"message"]);
                    }
                }
                [self respondToJS:callback data:@{
                    @"success": @(ok),
                    @"error": errorMsg ?: (ok ? @"" : @"交互请求失败")
                }];
            }] resume];
        };

        NSString *cachedGuild = self.channelGuildCache[channelId];
        if (cachedGuild.length > 0) {
            executeInteraction(cachedGuild);
        } else {
            NSString *chUrl = [NSString stringWithFormat:@"https://discord.com/api/v10/channels/%@", channelId];
            NSMutableURLRequest *chReq = [self requestWithURLString:chUrl method:@"GET"];
            [[self.session dataTaskWithRequest:chReq completionHandler:^(NSData *cData, NSURLResponse *cResp, NSError *cErr) {
                NSString *gId = @"";
                if (cData && !cErr) {
                    NSDictionary *cObj = [NSJSONSerialization JSONObjectWithData:cData options:0 error:nil];
                    if ([cObj isKindOfClass:[NSDictionary class]]) {
                        gId = SafeString(cObj[@"guild_id"]);
                        if (gId.length > 0) {
                            self.channelGuildCache[channelId] = gId;
                        }
                    }
                }
                executeInteraction(gId);
            }] resume];
        }
    }
    else if ([action isEqualToString:@"updateTouchBar"]) {
        self.currentChannelId = SafeString(body[@"channelId"]);
        self.currentChannelName = SafeString(body[@"channelName"]);
        self.currentBots = [body[@"bots"] isKindOfClass:[NSArray class]] ? body[@"bots"] : @[];
        self.currentMembers = [body[@"members"] isKindOfClass:[NSArray class]] ? body[@"members"] : @[];
        self.currentPinned = [body[@"pinned"] isKindOfClass:[NSArray class]] ? body[@"pinned"] : @[];

        dispatch_async(dispatch_get_main_queue(), ^{
            self.window.touchBar = [self makeTouchBar];
        });
        [self respondToJS:callback data:@{@"success": @YES}];
    }
    else if ([action isEqualToString:@"takeSnapshot"]) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self.webView takeSnapshotWithConfiguration:nil completionHandler:^(NSImage *snapshot, NSError *error) {
                if (snapshot) {
                    NSBitmapImageRep *rep = [NSBitmapImageRep imageRepWithData:[snapshot TIFFRepresentation]];
                    NSData *png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
                    [png writeToFile:@"/tmp/discordlight_webview_snapshot.png" atomically:YES];
                }
            }];
        });
        [self respondToJS:callback data:@{@"success": @YES}];
    }
    else if ([action isEqualToString:@"notify"]) {
        // System notification; clicking it brings the window back and opens body.channelId (see didReceiveNotificationResponse)
        UNUserNotificationCenter *center = [self notificationCenterOrNil];
        if (center) {
            UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
            content.title = SafeString(body[@"title"]);
            content.body = SafeString(body[@"body"]);
            content.sound = [UNNotificationSound defaultSound];
            content.userInfo = @{@"channelId": SafeString(body[@"channelId"])};
            NSString *tag = SafeString(body[@"tag"]);
            NSString *identifier = tag.length > 0 ? tag : [NSUUID UUID].UUIDString;
            UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:identifier content:content trigger:nil];
            [center addNotificationRequest:request withCompletionHandler:nil];
        }
        [self respondToJS:callback data:@{@"success": @(center != nil)}];
    }
    else if ([action isEqualToString:@"setBadge"]) {
        id rawCount = body[@"count"];
        NSInteger count = [rawCount isKindOfClass:[NSNumber class]] ? [rawCount integerValue] : 0;
        [NSApp dockTile].badgeLabel = count > 0 ? [NSString stringWithFormat:@"%ld", (long)count] : nil;
        [self respondToJS:callback data:@{@"success": @YES}];
    }
}

#pragma mark - Navigation Policy

// The web view holds the native bridge, so it only ever displays the bundled local page.
// Links in messages (http / https / mailto) are handed to the system; everything else is dropped.
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    NSString *scheme = url.scheme.lowercaseString ?: @"";

    if ([scheme isEqualToString:@"file"] || [url.absoluteString isEqualToString:@"about:blank"]) {
        decisionHandler(WKNavigationActionPolicyAllow);
        return;
    }

    if ([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"] || [scheme isEqualToString:@"mailto"]) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }
    decisionHandler(WKNavigationActionPolicyCancel);
}

// target="_blank" links and window.open(): never create a second web view, open http(s) in the system browser instead
- (nullable WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures {
    NSURL *url = navigationAction.request.URL;
    NSString *scheme = url.scheme.lowercaseString ?: @"";
    if ([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"]) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }
    return nil;
}

#pragma mark - Advanced Native NSTouchBar

- (NSString *)cleanChannelTitle:(NSString *)raw {
    NSString *clean = [raw stringByReplacingOccurrencesOfString:@"⭐" withString:@""];
    clean = [clean stringByReplacingOccurrencesOfString:@"#" withString:@""];
    clean = [clean stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
    NSRange paren = [clean rangeOfString:@"("];
    if (paren.location != NSNotFound) {
        clean = [[clean substringToIndex:paren.location] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
    }
    return [NSString stringWithFormat:@"# %@", clean];
}

- (NSTouchBar *)makeTouchBar {
    NSTouchBar *touchBar = [[NSTouchBar alloc] init];
    touchBar.delegate = self;

    NSMutableArray *identifiers = [NSMutableArray array];
    
    // 1. Sleek Minimal Logo
    [identifiers addObject:TBItemIdentifierLogo];
    [identifiers addObject:NSTouchBarItemIdentifierFixedSpaceSmall];

    // 2. Current Channel Label
    if (self.currentChannelName.length > 0) {
        [identifiers addObject:TBItemIdentifierChannelTitle];
        [identifiers addObject:NSTouchBarItemIdentifierFixedSpaceSmall];
    }

    // 3. Persistent Agents Popover & Quick Agent Buttons
    // Solving the IME candidate list conflict: Always accessible!
    if (self.currentBots.count > 0) {
        [identifiers addObject:TBItemIdentifierAgentsPopover];
        // Display direct button for top bot when space permits
        [identifiers addObject:[NSString stringWithFormat:@"%@.0", TBItemIdentifierBotPrefix]];
    }

    // 3b. Group DM Members Popover (humans only, kept apart from the agents)
    if (self.currentMembers.count > 0) {
        [identifiers addObject:TBItemIdentifierMembersPopover];
    }

    // 4. System Input Method Candidate List (Chinese / Pinyin / English autocorrect)
    [identifiers addObject:NSTouchBarItemIdentifierCandidateList];

    // 5. Flexible Spacer
    [identifiers addObject:NSTouchBarItemIdentifierFlexibleSpace];

    // 6. Channel Switcher Popover
    if (self.currentPinned.count > 1) {
        [identifiers addObject:TBItemIdentifierChannelsPopover];
    }

    // 7. Refresh
    [identifiers addObject:NSTouchBarItemIdentifierFixedSpaceSmall];
    [identifiers addObject:TBItemIdentifierRefresh];

    touchBar.defaultItemIdentifiers = identifiers;
    return touchBar;
}

- (nullable NSTouchBarItem *)touchBar:(NSTouchBar *)touchBar makeItemForIdentifier:(NSTouchBarItemIdentifier)identifier {
    if ([identifier isEqualToString:TBItemIdentifierLogo]) {
        NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
        NSString *tbIconPath = [[NSBundle mainBundle] pathForResource:@"touchbar_icon" ofType:@"png"];
        if (!tbIconPath || ![[NSFileManager defaultManager] fileExistsAtPath:tbIconPath]) {
            NSString *home = NSHomeDirectory();
            tbIconPath = [NSString stringWithFormat:@"%@/Developer/projects/DiscordLight/assets/touchbar_icon.png", home];
        }
        NSImage *img = [[NSImage alloc] initWithContentsOfFile:tbIconPath];
        if (img) {
            [img setSize:NSMakeSize(18, 18)];
            [img setTemplate:NO];
            NSButton *btn = [NSButton buttonWithImage:img target:self action:@selector(touchBarLogoClicked:)];
            [btn setBordered:NO];
            item.view = btn;
        }
        return item;
    }
    else if ([identifier isEqualToString:TBItemIdentifierChannelTitle]) {
        NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
        NSString *title = [NSString stringWithFormat:@"# %@", self.currentChannelName ?: @""];
        NSTextField *label = [NSTextField labelWithString:title];
        label.textColor = [NSColor colorWithCalibratedWhite:0.78 alpha:1.0];
        label.font = [NSFont systemFontOfSize:13.0 weight:NSFontWeightSemibold];
        item.view = label;
        return item;
    }
    else if ([identifier isEqualToString:TBItemIdentifierAgentsPopover]) {
        // Expandable Sub-TouchBar with all bots in the channel
        NSPopoverTouchBarItem *popover = [[NSPopoverTouchBarItem alloc] initWithIdentifier:identifier];
        popover.collapsedRepresentationLabel = [NSString stringWithFormat:@"@ 智能体 (%lu)", (unsigned long)self.currentBots.count];
        popover.showsCloseButton = YES;

        NSTouchBar *subBar = [[NSTouchBar alloc] init];
        subBar.delegate = self;
        NSMutableArray *subIds = [NSMutableArray array];
        for (NSUInteger i = 0; i < self.currentBots.count; i++) {
            [subIds addObject:[NSString stringWithFormat:@"%@.%lu", TBItemIdentifierPopoverBotPrefix, (unsigned long)i]];
        }
        subBar.defaultItemIdentifiers = subIds;
        popover.popoverTouchBar = subBar;
        return popover;
    }
    else if ([identifier hasPrefix:TBItemIdentifierPopoverBotPrefix]) {
        NSString *indexStr = [identifier substringFromIndex:TBItemIdentifierPopoverBotPrefix.length + 1];
        NSUInteger index = [indexStr integerValue];
        if (index < self.currentBots.count) {
            NSDictionary *bot = self.currentBots[index];
            NSString *botName = SafeString(bot[@"name"]);
            NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
            NSButton *btn = [NSButton buttonWithTitle:[NSString stringWithFormat:@"@%@", botName]
                                               target:self
                                               action:@selector(touchBarPopoverBotClicked:)];
            btn.tag = index;
            btn.bezelStyle = NSBezelStyleRounded;
            item.view = btn;
            return item;
        }
    }
    else if ([identifier isEqualToString:TBItemIdentifierMembersPopover]) {
        // Expandable Sub-TouchBar with the human members of a group DM
        NSPopoverTouchBarItem *popover = [[NSPopoverTouchBarItem alloc] initWithIdentifier:identifier];
        popover.collapsedRepresentationLabel = [NSString stringWithFormat:@"@ 成员 (%lu)", (unsigned long)self.currentMembers.count];
        popover.showsCloseButton = YES;

        NSTouchBar *subBar = [[NSTouchBar alloc] init];
        subBar.delegate = self;
        NSMutableArray *subIds = [NSMutableArray array];
        for (NSUInteger i = 0; i < self.currentMembers.count; i++) {
            [subIds addObject:[NSString stringWithFormat:@"%@.%lu", TBItemIdentifierPopoverMemberPrefix, (unsigned long)i]];
        }
        subBar.defaultItemIdentifiers = subIds;
        popover.popoverTouchBar = subBar;
        return popover;
    }
    else if ([identifier hasPrefix:TBItemIdentifierPopoverMemberPrefix]) {
        NSString *indexStr = [identifier substringFromIndex:TBItemIdentifierPopoverMemberPrefix.length + 1];
        NSUInteger index = [indexStr integerValue];
        if (index < self.currentMembers.count) {
            NSDictionary *member = self.currentMembers[index];
            NSString *memberName = SafeString(member[@"name"]);
            NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
            NSButton *btn = [NSButton buttonWithTitle:[NSString stringWithFormat:@"@%@", memberName]
                                               target:self
                                               action:@selector(touchBarPopoverMemberClicked:)];
            btn.tag = index;
            btn.bezelStyle = NSBezelStyleRounded;
            item.view = btn;
            return item;
        }
    }
    else if ([identifier hasPrefix:TBItemIdentifierBotPrefix]) {
        NSString *indexStr = [identifier substringFromIndex:TBItemIdentifierBotPrefix.length + 1];
        NSUInteger index = [indexStr integerValue];
        if (index < self.currentBots.count) {
            NSDictionary *bot = self.currentBots[index];
            NSString *botName = SafeString(bot[@"name"]);
            NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
            NSButton *btn = [NSButton buttonWithTitle:[NSString stringWithFormat:@"@%@", botName]
                                               target:self
                                               action:@selector(touchBarBotClicked:)];
            btn.tag = index;
            btn.bezelStyle = NSBezelStyleRounded;
            item.view = btn;
            return item;
        }
    }
    else if ([identifier isEqualToString:NSTouchBarItemIdentifierCandidateList]) {
        NSCandidateListTouchBarItem *item = [[NSCandidateListTouchBarItem alloc] initWithIdentifier:identifier];
        return item;
    }
    else if ([identifier isEqualToString:TBItemIdentifierChannelsPopover]) {
        NSPopoverTouchBarItem *popover = [[NSPopoverTouchBarItem alloc] initWithIdentifier:identifier];
        popover.collapsedRepresentationLabel = @"# 频道";
        popover.showsCloseButton = YES;

        NSTouchBar *subBar = [[NSTouchBar alloc] init];
        subBar.delegate = self;
        NSMutableArray *subIds = [NSMutableArray array];
        for (NSUInteger i = 0; i < self.currentPinned.count; i++) {
            [subIds addObject:[NSString stringWithFormat:@"%@.%lu", TBItemIdentifierPopoverPinPrefix, (unsigned long)i]];
        }
        subBar.defaultItemIdentifiers = subIds;
        popover.popoverTouchBar = subBar;
        return popover;
    }
    else if ([identifier hasPrefix:TBItemIdentifierPopoverPinPrefix]) {
        NSString *indexStr = [identifier substringFromIndex:TBItemIdentifierPopoverPinPrefix.length + 1];
        NSUInteger index = [indexStr integerValue];
        if (index < self.currentPinned.count) {
            NSDictionary *pin = self.currentPinned[index];
            NSString *rawName = SafeString(pin[@"name"]);
            NSString *displayTitle = [self cleanChannelTitle:rawName];
            NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
            NSButton *btn = [NSButton buttonWithTitle:displayTitle
                                               target:self
                                               action:@selector(touchBarPopoverPinClicked:)];
            btn.tag = index;
            btn.bezelStyle = NSBezelStyleRounded;
            item.view = btn;
            return item;
        }
    }
    else if ([identifier isEqualToString:TBItemIdentifierRefresh]) {
        NSCustomTouchBarItem *item = [[NSCustomTouchBarItem alloc] initWithIdentifier:identifier];
        NSButton *btn = [NSButton buttonWithTitle:@"刷新" target:self action:@selector(touchBarRefreshClicked:)];
        btn.bezelStyle = NSBezelStyleRounded;
        item.view = btn;
        return item;
    }
    return nil;
}

#pragma mark - Touch Bar Actions

// Quotes one string as a JS string literal (JSON-encoded). Bot / channel names come from Discord,
// so they must never be pasted raw into the script handed to evaluateJavaScript:.
- (NSString *)jsStringLiteral:(NSString *)value {
    NSData *data = [NSJSONSerialization dataWithJSONObject:@[value ?: @""] options:0 error:nil];
    NSString *json = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : nil;
    if (json.length < 2) return @"\"\"";
    // json is ["..."]: drop the surrounding brackets, keep the quoted literal
    return JSSafeJSON([json substringWithRange:NSMakeRange(1, json.length - 2)]);
}

- (void)touchBarLogoClicked:(id)sender {
    [self.webView evaluateJavaScript:@"window.touchBarAction && window.touchBarAction('logo');" completionHandler:nil];
}

- (void)touchBarBotClicked:(NSButton *)sender {
    NSUInteger idx = sender.tag;
    if (idx < self.currentBots.count) {
        NSDictionary *bot = self.currentBots[idx];
        NSString *botName = SafeString(bot[@"name"]);
        NSString *js = [NSString stringWithFormat:@"window.insertMentionFromTouchBar && window.insertMentionFromTouchBar(%@);", [self jsStringLiteral:botName]];
        [self.webView evaluateJavaScript:js completionHandler:nil];
    }
}

- (void)touchBarPopoverBotClicked:(NSButton *)sender {
    NSUInteger idx = sender.tag;
    if (idx < self.currentBots.count) {
        NSDictionary *bot = self.currentBots[idx];
        NSString *botName = SafeString(bot[@"name"]);
        NSString *js = [NSString stringWithFormat:@"window.insertMentionFromTouchBar && window.insertMentionFromTouchBar(%@);", [self jsStringLiteral:botName]];
        [self.webView evaluateJavaScript:js completionHandler:nil];
        
        // Auto-close popover to return to typing & IME
        [self.window.touchBar.itemIdentifiers enumerateObjectsUsingBlock:^(NSTouchBarItemIdentifier ident, NSUInteger i, BOOL *stop) {
            NSTouchBarItem *item = [self.window.touchBar itemForIdentifier:ident];
            if ([item isKindOfClass:[NSPopoverTouchBarItem class]]) {
                [(NSPopoverTouchBarItem *)item dismissPopover:sender];
            }
        }];
    }
}

- (void)touchBarPopoverMemberClicked:(NSButton *)sender {
    NSUInteger idx = sender.tag;
    if (idx < self.currentMembers.count) {
        NSDictionary *member = self.currentMembers[idx];
        NSString *memberName = SafeString(member[@"name"]);
        NSString *js = [NSString stringWithFormat:@"window.insertMentionFromTouchBar && window.insertMentionFromTouchBar(%@);", [self jsStringLiteral:memberName]];
        [self.webView evaluateJavaScript:js completionHandler:nil];

        // Auto-close popover to return to typing & IME
        [self.window.touchBar.itemIdentifiers enumerateObjectsUsingBlock:^(NSTouchBarItemIdentifier ident, NSUInteger i, BOOL *stop) {
            NSTouchBarItem *item = [self.window.touchBar itemForIdentifier:ident];
            if ([item isKindOfClass:[NSPopoverTouchBarItem class]]) {
                [(NSPopoverTouchBarItem *)item dismissPopover:sender];
            }
        }];
    }
}

- (void)touchBarPopoverPinClicked:(NSButton *)sender {
    NSUInteger idx = sender.tag;
    if (idx < self.currentPinned.count) {
        NSDictionary *pin = self.currentPinned[idx];
        NSString *pinId = SafeString(pin[@"id"]);
        NSString *js = [NSString stringWithFormat:@"window.switchChannelById && window.switchChannelById(%@);", [self jsStringLiteral:pinId]];
        [self.webView evaluateJavaScript:js completionHandler:nil];
        
        [self.window.touchBar.itemIdentifiers enumerateObjectsUsingBlock:^(NSTouchBarItemIdentifier ident, NSUInteger i, BOOL *stop) {
            NSTouchBarItem *item = [self.window.touchBar itemForIdentifier:ident];
            if ([item isKindOfClass:[NSPopoverTouchBarItem class]]) {
                [(NSPopoverTouchBarItem *)item dismissPopover:sender];
            }
        }];
    }
}

- (void)touchBarRefreshClicked:(id)sender {
    [self.webView evaluateJavaScript:@"window.loadMessages && window.loadMessages();" completionHandler:nil];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

#pragma mark - Visibility (poll interval)

// The web layer polls every 2.5 s while the window can be seen and every 15 s otherwise (app.js setAppVisible)
- (void)notifyWebVisible:(BOOL)visible {
    NSString *js = [NSString stringWithFormat:@"window.setAppVisible && window.setAppVisible(%@);", visible ? @"true" : @"false"];
    [self.webView evaluateJavaScript:js completionHandler:nil];
}

- (void)windowDidChangeOcclusionState:(NSNotification *)notification {
    BOOL visible = (self.window.occlusionState & NSWindowOcclusionStateVisible) != 0;
    [self notifyWebVisible:visible];
}

- (void)applicationDidHide:(NSNotification *)notification {
    [self notifyWebVisible:NO];
}

- (void)applicationDidUnhide:(NSNotification *)notification {
    // A window left in the Dock stays hidden after unhide (its occlusion state does not change then)
    [self notifyWebVisible:![self.window isMiniaturized]];
}

#pragma mark - Focus, Dock badge & notifications

// The web layer only notifies while the window is not key (or cannot be seen): app.js setAppFocused / maybeNotify
- (void)notifyWebFocused:(BOOL)focused {
    NSString *js = [NSString stringWithFormat:@"window.setAppFocused && window.setAppFocused(%@);", focused ? @"true" : @"false"];
    [self.webView evaluateJavaScript:js completionHandler:nil];
}

- (void)windowDidBecomeKey:(NSNotification *)notification {
    [NSApp dockTile].badgeLabel = nil;
    [self notifyWebFocused:YES];
}

- (void)windowDidResignKey:(NSNotification *)notification {
    [self notifyWebFocused:NO];
}

// The page can finish loading after the window became key: hand it the current focus state once it is ready
- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    [self notifyWebFocused:self.window.isKeyWindow];
}

// UNUserNotificationCenter needs an app bundle: run as a bare binary (no bundle identifier) it throws, so every
// notification path goes through this and simply does nothing there.
- (UNUserNotificationCenter *)notificationCenterOrNil {
    if ([NSBundle mainBundle].bundleIdentifier.length == 0) return nil;
    @try {
        return [UNUserNotificationCenter currentNotificationCenter];
    } @catch (NSException *exception) {
        return nil;
    }
}

- (void)setupNotifications {
    UNUserNotificationCenter *center = [self notificationCenterOrNil];
    if (!center) return;
    center.delegate = self;
    [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                          completionHandler:^(BOOL granted, NSError *error) {}];
}

// Show the banner even when the app is frontmost (the web layer already decided it should be shown)
- (void)userNotificationCenter:(UNUserNotificationCenter *)center willPresentNotification:(UNNotification *)notification withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler {
    if (@available(macOS 11, *)) {
        completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound);
    } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        completionHandler(UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionSound);
#pragma clang diagnostic pop
    }
}

// Clicked notification: bring the window back and open the channel the message came from
- (void)userNotificationCenter:(UNUserNotificationCenter *)center didReceiveNotificationResponse:(UNNotificationResponse *)response withCompletionHandler:(void (^)(void))completionHandler {
    NSString *channelId = SafeString(response.notification.request.content.userInfo[@"channelId"]);
    dispatch_async(dispatch_get_main_queue(), ^{
        [NSApp activateIgnoringOtherApps:YES];
        [self.window makeKeyAndOrderFront:nil];
        if (channelId.length > 0) {
            NSString *js = [NSString stringWithFormat:@"window.switchChannelById && window.switchChannelById(%@);", [self jsStringLiteral:channelId]];
            [self.webView evaluateJavaScript:js completionHandler:nil];
        }
    });
    completionHandler();
}
@end

static AppDelegate *gDelegate = nil;

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        gDelegate = [[AppDelegate alloc] init];
        app.delegate = gDelegate;
        [app run];
    }
    return 0;
}
