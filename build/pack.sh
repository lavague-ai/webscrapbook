# System requirements:
# * OS: *nix
# * zip
#
# Steps:
# * Adjust $filename variable to fit your needs.
# * Run this script, and the packed files are created in the ../dist directory.
#
#
key="chrome_key.pem"
dir=$(dirname $(realpath "$0"))
src=$(realpath "$dir/../src")
dist=$(realpath "$dir/../dist")

rm -rf "$dist"
mkdir "$dist"

# The key needs to always be the same for the page to be able to communicate to the extension
/opt/google/chrome/google-chrome --pack-extension="$src" --pack-extension-key="$key"
mv src.crx "$dist/WebScrapbook.crx"


