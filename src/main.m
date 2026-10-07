#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static inline NSString *SafeString(id val) {
    if (!val || val == [NSNull null] || ![val isKindOfClass:[NSString class]]) {
        return @"";
    }
    return (NSString *)val;
}

// Touch Bar Identifiers
static NSTouchBarItemIdentifier const TBItemIdentifierLogo = @"com.discordlight.touchbar.logo";
static NSTouchBarItemIdentifier const TBItemIdentifierChannelTitle = @"com.discordlight.touchbar.channel";
static NSTouchBarItemIdentifier const TBItemIdentifierAgentsPopover = @"com.discordlight.touchbar.agents_popover";
static NSString * const TBItemIdentifierPopoverBotPrefix = @"com.discordlight.touchbar.popover.bot";
static NSString * const TBItemIdentifierBotPrefix = @"com.discordlight.touchbar.bot";
static NSTouchBarItemIdentifier const TBItemIdentifierChannelsPopover = @"com.discordlight.touchbar.channels_popover";
static NSString * const TBItemIdentifierPopoverPinPrefix = @"com.discordlight.touchbar.popover.pin";
static NSString * const TBItemIdentifierPinPrefix = @"com.discordlight.touchbar.pin";
static NSTouchBarItemIdentifier const TBItemIdentifierRefresh = @"com.discordlight.touchbar.refresh";

@interface AppDelegate : NSResponder <NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, NSTouchBarDelegate>
@property (nonatomic, strong) NSWindow *window;
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) NSString *token;
@property (nonatomic, strong) NSString *configPath;
@property (nonatomic, strong) NSMutableDictionary *config;
@property (nonatomic, strong) NSURLSession *session;
@property (nonatomic, strong) NSString *currentChannelId;
@property (nonatomic, strong) NSString *currentChannelName;
@property (nonatomic, strong) NSArray *currentBots;
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
    
    // Discover token from environment or config file
    NSString *envToken = [[[NSProcessInfo processInfo] environment] objectForKey:@"DISCORD_TOKEN"];
    if (envToken.length > 0) {
        self.token = envToken;
    } else if (self.config[@"token"] && [self.config[@"token"] length] > 0) {
        self.token = self.config[@"token"];
    } else {
        self.token = @"";
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
                                              styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    self.window.title = @"DiscordLight";
    self.window.minSize = NSMakeSize(760, 500);
    self.window.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    self.window.titlebarAppearsTransparent = YES;
    [self.window center];

    self.webView = [[WKWebView alloc] initWithFrame:self.window.contentView.bounds configuration:webConfig];
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.webView.navigationDelegate = self;
    [self.window.contentView addSubview:self.webView];

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

    [[NSDistributedNotificationCenter defaultCenter] addObserver:self
                                                         selector:@selector(handleTestNotification:)
                                                             name:@"com.discordlight.test"
                                                           object:nil];
}

- (void)handleTestNotification:(NSNotification *)note {
    NSString *obj = (NSString *)note.object;
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
    NSError *err = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:data options:0 error:&err];
    NSString *jsonStr = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    NSString *js = [NSString stringWithFormat:@"window.%@(%@);", callback, jsonStr ?: @"{}"];
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
        safeConf[@"hasToken"] = @(self.token.length > 0);
        [self respondToJS:callback data:safeConf];
    }
    else if ([action isEqualToString:@"saveConfig"]) {
        if (body[@"token"]) {
            self.token = SafeString(body[@"token"]);
            self.config[@"token"] = self.token;
        }
        if (body[@"pinned_channels"]) self.config[@"pinned_channels"] = body[@"pinned_channels"];
        if (body[@"last_channel_id"]) self.config[@"last_channel_id"] = body[@"last_channel_id"];
        [self saveConfig];
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

- (void)touchBarLogoClicked:(id)sender {
    [self.webView evaluateJavaScript:@"window.touchBarAction && window.touchBarAction('logo');" completionHandler:nil];
}

- (void)touchBarBotClicked:(NSButton *)sender {
    NSUInteger idx = sender.tag;
    if (idx < self.currentBots.count) {
        NSDictionary *bot = self.currentBots[idx];
        NSString *botName = SafeString(bot[@"name"]);
        NSString *js = [NSString stringWithFormat:@"window.insertMentionFromTouchBar && window.insertMentionFromTouchBar('%@');", botName];
        [self.webView evaluateJavaScript:js completionHandler:nil];
    }
}

- (void)touchBarPopoverBotClicked:(NSButton *)sender {
    NSUInteger idx = sender.tag;
    if (idx < self.currentBots.count) {
        NSDictionary *bot = self.currentBots[idx];
        NSString *botName = SafeString(bot[@"name"]);
        NSString *js = [NSString stringWithFormat:@"window.insertMentionFromTouchBar && window.insertMentionFromTouchBar('%@');", botName];
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
        NSString *js = [NSString stringWithFormat:@"window.switchChannelById && window.switchChannelById('%@');", pinId];
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
