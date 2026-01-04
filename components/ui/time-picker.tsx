import * as React from "react";
import { cn } from "@/lib/utils";

interface TimePickerProps {
    value: number; // value in minutes
    onChange: (minutes: number) => void;
    className?: string;
}

export function TimePicker({ value, onChange, className }: TimePickerProps) {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;

    const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newHours = parseInt(e.target.value) || 0;
        onChange(newHours * 60 + minutes);
    };

    const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newMinutes = parseInt(e.target.value) || 0;
        onChange(hours * 60 + newMinutes);
    };

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div className="flex items-center gap-1">
                <input
                    type="number"
                    min="0"
                    max="23"
                    value={hours}
                    onChange={handleHoursChange}
                    className="w-16 h-10 px-3 py-2 text-center rounded-md border border-[#333] bg-[#1a1a1a] text-sm focus:outline-none focus:border-chaos-accent"
                />
                <span className="text-gray-400 text-sm">h</span>
            </div>
            <div className="flex items-center gap-1">
                <input
                    type="number"
                    min="0"
                    max="59"
                    value={minutes}
                    onChange={handleMinutesChange}
                    className="w-16 h-10 px-3 py-2 text-center rounded-md border border-[#333] bg-[#1a1a1a] text-sm focus:outline-none focus:border-chaos-accent"
                />
                <span className="text-gray-400 text-sm">m</span>
            </div>
        </div>
    );
}
