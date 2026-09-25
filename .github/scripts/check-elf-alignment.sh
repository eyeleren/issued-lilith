#!/bin/sh
# QNAP ARM kernels use 32 KB pages: every ELF LOAD segment must be aligned to at least that.
# Usage: check-elf-alignment.sh <image | rootfs-dir> [min-bytes]
set -eu

target=$1
min=${2:-32768}

if [ -d "$target" ]; then
	root=$target
else
	root=$(mktemp -d)
	trap 'rm -rf "$root"' EXIT
	id=$(docker create --platform linux/arm/v7 "$target")
	docker export "$id" | tar -x -C "$root" 2>/dev/null || true
	docker rm "$id" >/dev/null
fi

list=$(mktemp)
find "$root" -type f \( -perm -u+x -o -name '*.so*' -o -name '*.node' \) > "$list"

total=0
bad=0
while IFS= read -r file; do
	aligns=$(readelf -lW "$file" 2>/dev/null | awk '$1 == "LOAD" { print $NF }') || true
	[ -n "$aligns" ] || continue
	total=$((total + 1))
	for align in $aligns; do
		if [ $((align)) -lt "$min" ]; then
			echo "misaligned ($align): ${file#"$root"}"
			bad=$((bad + 1))
			break
		fi
	done
done < "$list"
rm -f "$list"

echo "$total ELF files checked, $bad aligned below $min bytes"
[ "$bad" -eq 0 ]
