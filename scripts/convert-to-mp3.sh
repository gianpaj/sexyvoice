#!/bin/bash

if [ $# -ne 2 ]; then
    echo "Usage: $0 <input_file> <output_file>"
    exit 1
fi

# Convert audio file to MP3 format with the following parameters:
# -i "$1"           : Input file (first argument)
# -acodec libmp3lame: Audio codec (MP3 LAME encoder)
# -q:a 2            : Audio quality (2 = high quality, ~190-250 kbps)
# -ar 24000         : Audio sample rate (24000 Hz)
# -ac 1             : Audio channels (1 = mono)
# "$2"              : Output file (second argument)
ffmpeg -i "$1" -acodec libmp3lame -q:a 2 -ar 24000 -ac 1 "$2"
