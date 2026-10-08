APP_NAME = DiscordLight
BUNDLE = $(APP_NAME).app
CONTENTS = $(BUNDLE)/Contents
MACOS = $(CONTENTS)/MacOS
RESOURCES = $(CONTENTS)/Resources

all: build

build:
	@echo "Building $(APP_NAME)..."
	@mkdir -p $(MACOS) $(RESOURCES)/web
	clang -fmodules -fobjc-arc -framework Cocoa -framework WebKit -O2 -Wall -o $(MACOS)/$(APP_NAME) src/main.m
	cp src/Info.plist $(CONTENTS)/Info.plist
	cp assets/AppIcon.icns $(RESOURCES)/AppIcon.icns
	cp assets/touchbar_icon.png $(RESOURCES)/touchbar_icon.png
	cp -R web/* $(RESOURCES)/web/
	@echo "Build complete: $(BUNDLE)"

install: build
	@echo "Installing to /Applications..."
	rm -rf /Applications/$(BUNDLE)
	cp -R $(BUNDLE) /Applications/
	@echo "Installed successfully to /Applications/$(BUNDLE)"

clean:
	rm -rf $(BUNDLE)

test:
	cd tests && npm test

.PHONY: all build install clean test
