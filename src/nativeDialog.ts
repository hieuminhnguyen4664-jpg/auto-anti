import * as vscode from 'vscode';
import { exec } from 'child_process';

export class NativeDialogClicker {
    private intervalId: NodeJS.Timeout | null = null;
    private enabled: boolean = true;
    private clickCount: number = 0;
    private onClickCountChange: ((count: number) => void) | null = null;

    /**
     * Start polling for native "Not Responding" dialogs (Windows only)
     */
    start(): void {
        if (process.platform !== 'win32') {
            console.log('[Auto Accept] Native dialog clicker only supports Windows');
            return;
        }

        this.intervalId = setInterval(() => {
            if (!this.enabled) return;
            this.findAndClickKeepWaiting();
        }, 5000);
    }

    /**
     * Use PowerShell to find and click "Keep Waiting" button in Win32 dialogs
     */
    private findAndClickKeepWaiting(): void {
        const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Win32Dialog {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    
    [DllImport("user32.dll")]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    
    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);
    
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    
    public const uint BM_CLICK = 0x00F5;
    
    public static int ClickCount = 0;
    
    public static void FindAndClick() {
        EnumWindows(delegate(IntPtr hWnd, IntPtr param) {
            if (!IsWindowVisible(hWnd)) return true;
            
            StringBuilder className = new StringBuilder(256);
            GetClassName(hWnd, className, 256);
            
            if (className.ToString() == "#32770") {
                EnumChildWindows(hWnd, delegate(IntPtr childHwnd, IntPtr childParam) {
                    StringBuilder childClass = new StringBuilder(256);
                    GetClassName(childHwnd, childClass, 256);
                    
                    if (childClass.ToString() == "Button") {
                        StringBuilder text = new StringBuilder(256);
                        GetWindowText(childHwnd, text, 256);
                        string btnText = text.ToString();
                        
                        if (btnText.Contains("Keep") || btnText.Contains("Wait") || btnText.Contains("keep") || btnText.Contains("wait")) {
                            PostMessage(childHwnd, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
                            ClickCount++;
                        }
                    }
                    return true;
                }, IntPtr.Zero);
            }
            return true;
        }, IntPtr.Zero);
    }
}
"@

[Win32Dialog]::FindAndClick()
Write-Output $([Win32Dialog]::ClickCount)
`;

        exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
            { timeout: 10000 },
            (error, stdout) => {
                if (!error && stdout.trim()) {
                    const count = parseInt(stdout.trim(), 10);
                    if (count > 0) {
                        this.clickCount += count;
                        if (this.onClickCountChange) {
                            this.onClickCountChange(this.clickCount);
                        }
                    }
                }
            }
        );
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    getClickCount(): number {
        return this.clickCount;
    }

    onCountChange(cb: (count: number) => void): void {
        this.onClickCountChange = cb;
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}
