import { ImageResponse } from 'next/og';

// Image metadata
export const size = {
    width: 32,
    height: 32,
};
export const contentType = 'image/png';

// Image generation
export default function Icon() {
    return new ImageResponse(
        (
            // ImageResponse JSX element
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(to bottom right, #FFA500, #FF0000)',
                    borderRadius: '8px',
                    color: 'white',
                    fontFamily: 'serif',
                    fontStyle: 'italic',
                    fontSize: 20,
                }}
            >
                C
            </div>
        ),
        // ImageResponse options
        {
            ...size,
        }
    );
}
