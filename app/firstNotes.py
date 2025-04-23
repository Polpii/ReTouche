import mido
from mido import MidiFile

def midi_to_piano_notes(file_path, num_notes=10):
    midi = MidiFile(file_path)
    notes = []
    
    for track in midi.tracks:
        for msg in track:
            if msg.type == 'note_on' and msg.velocity > 0:
                note_number = msg.note
                octave = (note_number // 12) - 1
                note_name = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][note_number % 12]
                position = f"{note_name}{octave}"
                notes.append(position)
                if len(notes) >= num_notes:
                    return notes
    
    return notes

# Exemple d'utilisation
file_path = "./public/piano2.mid"  # Remplacez par le chemin de votre fichier MIDI
notes = midi_to_piano_notes(file_path)
print("Premières notes jouées:", notes)