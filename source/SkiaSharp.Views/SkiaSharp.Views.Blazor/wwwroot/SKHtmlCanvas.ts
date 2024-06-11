﻿// aliases for emscripten
declare let GL: any;
declare let GLctx: WebGLRenderingContext;
declare let Module: EmscriptenModule;

// container for gl info
type SKGLViewInfo = {
	context: WebGLRenderingContext | WebGL2RenderingContext | undefined;
	fboId: number;
	stencil: number;
	sample: number;
	depth: number;
}

// alias for a potential skia html canvas
type SKHtmlCanvasElement = {
	SKHtmlCanvas: SKHtmlCanvas
} & HTMLCanvasElement

export class SKHtmlCanvas {
	static elements: Map<string, HTMLCanvasElement>;

	htmlCanvas: HTMLCanvasElement;
	glInfo: SKGLViewInfo;
	renderFrameCallback: DotNet.DotNetObjectReference;
	renderLoopEnabled: boolean = false;
	renderLoopRequest: number = 0;

	public static initGL(element: HTMLCanvasElement, elementId: string, callback: DotNet.DotNetObjectReference): SKGLViewInfo {
		var view = SKHtmlCanvas.init(true, element, elementId, callback);
		if (!view || !view.glInfo)
			return null;

		return view.glInfo;
	}

	public static initRaster(element: HTMLCanvasElement, elementId: string, callback: DotNet.DotNetObjectReference): boolean {
		var view = SKHtmlCanvas.init(false, element, elementId, callback);
		if (!view)
			return false;

		return true;
	}

	static init(useGL: boolean, element: HTMLCanvasElement, elementId: string, callback: DotNet.DotNetObjectReference): SKHtmlCanvas {
		var htmlCanvas = element as SKHtmlCanvasElement;
		if (!htmlCanvas) {
			console.error(`No canvas element was provided.`);
			return null;
		}

		if (!SKHtmlCanvas.elements)
			SKHtmlCanvas.elements = new Map<string, HTMLCanvasElement>();
		SKHtmlCanvas.elements[elementId] = element;

		const view = new SKHtmlCanvas(useGL, element, callback);

		htmlCanvas.SKHtmlCanvas = view;

		return view;
	}

	public static deinit(elementId: string) {
		if (!elementId)
			return;

		const element = SKHtmlCanvas.elements[elementId];
		SKHtmlCanvas.elements.delete(elementId);

		const htmlCanvas = element as SKHtmlCanvasElement;
		if (!htmlCanvas || !htmlCanvas.SKHtmlCanvas)
			return;

		htmlCanvas.SKHtmlCanvas.deinit();
		htmlCanvas.SKHtmlCanvas = undefined;
	}

	public static requestAnimationFrame(element: HTMLCanvasElement, renderLoop?: boolean, width?: number, height?: number) {
		const htmlCanvas = element as SKHtmlCanvasElement;
		if (!htmlCanvas || !htmlCanvas.SKHtmlCanvas)
			return;

		htmlCanvas.SKHtmlCanvas.requestAnimationFrame(renderLoop, width, height);
	}

	public static setEnableRenderLoop(element: HTMLCanvasElement, enable: boolean) {
		const htmlCanvas = element as SKHtmlCanvasElement;
		if (!htmlCanvas || !htmlCanvas.SKHtmlCanvas)
			return;

		htmlCanvas.SKHtmlCanvas.setEnableRenderLoop(enable);
	}

	public static putImageData(element: HTMLCanvasElement, imageData: Uint8Array, width: number, height: number) {
		const htmlCanvas = element as SKHtmlCanvasElement;
		if (!htmlCanvas || !htmlCanvas.SKHtmlCanvas)
			return;

		htmlCanvas.SKHtmlCanvas.putImageData(imageData, width, height);
	}

	public constructor(useGL: boolean, element: HTMLCanvasElement, callback: DotNet.DotNetObjectReference) {
		this.htmlCanvas = element;
		this.renderFrameCallback = callback;

		if (useGL) {
			const ctx = SKHtmlCanvas.createWebGLContext(this.htmlCanvas);
			if (!ctx) {
				console.error(`Failed to create WebGL context: err ${ctx}`);
				return null;
			}

			// make current
			const GL = SKHtmlCanvas.getGL();
			GL.makeContextCurrent(ctx);

			// read values
			const GLctx = SKHtmlCanvas.getGLctx();
			const fbo = GLctx.getParameter(GLctx.FRAMEBUFFER_BINDING);
			this.glInfo = {
				context: ctx,
				fboId: fbo ? fbo.id : 0,
				stencil: GLctx.getParameter(GLctx.STENCIL_BITS),
				sample: 0, // TODO: GLctx.getParameter(GLctx.SAMPLES)
				depth: GLctx.getParameter(GLctx.DEPTH_BITS),
			};
		}
	}

	public deinit() {
		this.setEnableRenderLoop(false);
	}

	public requestAnimationFrame(renderLoop?: boolean, width?: number, height?: number) {
		// optionally update the render loop
		if (renderLoop !== undefined && this.renderLoopEnabled !== renderLoop)
			this.setEnableRenderLoop(renderLoop);

		// make sure the canvas is scaled correctly for the drawing
		if (width && height) {
			if (this.htmlCanvas.width !== width) 
				this.htmlCanvas.width = width;
			if (this.htmlCanvas.height !== height) 
				this.htmlCanvas.height = height;
		}

		// skip because we have a render loop
		if (this.renderLoopRequest !== 0)
			return;

		// add the draw to the next frame
		this.renderLoopRequest = window.requestAnimationFrame(async () => {
			if (this.glInfo) {
				// make current
				const GL = SKHtmlCanvas.getGL();
				GL.makeContextCurrent(this.glInfo.context);
			}

			await this.renderFrameCallback.invokeMethodAsync('Invoke');
			this.renderLoopRequest = 0;

			// we may want to draw the next frame
			if (this.renderLoopEnabled)
				this.requestAnimationFrame();
		});
	}

	public setEnableRenderLoop(enable: boolean) {
		this.renderLoopEnabled = enable;

		// either start the new frame or cancel the existing one
		if (enable) {
			//console.info(`Enabling render loop with callback ${this.renderFrameCallback._id}...`);
			this.requestAnimationFrame();
		} else if (this.renderLoopRequest !== 0) {
			window.cancelAnimationFrame(this.renderLoopRequest);
			this.renderLoopRequest = 0;
		}
	}

	public putImageData(imageData: Uint8Array, width: number, height: number): boolean {
		if (this.glInfo || !imageData || width <= 0 || width <= 0)
			return false;

		var ctx = this.htmlCanvas.getContext('2d');
		if (!ctx) {
			console.error(`Failed to obtain 2D canvas context.`);
			return false;
		}

		// make sure the canvas is scaled correctly for the drawing
		if (this.htmlCanvas.width !== width) {
			this.htmlCanvas.width = width;
		}
		if (this.htmlCanvas.height !== height) {
			this.htmlCanvas.height = height;
		}

		// set the canvas to be the bytes
		var buffer = new Uint8ClampedArray(imageData.buffer, imageData.byteOffset, imageData.length);
		var imageDataObject = new ImageData(buffer, width, height);
		ctx.putImageData(imageDataObject, 0, 0);

		return true;
	}

	static createWebGLContext(htmlCanvas: HTMLCanvasElement): WebGLRenderingContext | WebGL2RenderingContext {
		const contextAttributes = {
			alpha: 1,
			depth: 1,
			stencil: 8,
			antialias: 1,
			premultipliedAlpha: 1,
			preserveDrawingBuffer: 0,
			preferLowPowerToHighPerformance: 0,
			failIfMajorPerformanceCaveat: 0,
			majorVersion: 2,
			minorVersion: 0,
			enableExtensionsByDefault: 1,
			explicitSwapControl: 0,
			renderViaOffscreenBackBuffer: 0,
		};

		const GL = SKHtmlCanvas.getGL();
		let ctx: WebGLRenderingContext = GL.createContext(htmlCanvas, contextAttributes);
		if (!ctx && contextAttributes.majorVersion > 1) {
			console.warn('Falling back to WebGL 1.0');
			contextAttributes.majorVersion = 1;
			contextAttributes.minorVersion = 0;
			ctx = GL.createContext(htmlCanvas, contextAttributes);
		}

		return ctx;
	}

	static getGL(): any {
		return (globalThis as any).SkiaSharpGL || (Module as any).GL || GL;
	}

	static getGLctx(): WebGLRenderingContext {
		const GL = SKHtmlCanvas.getGL();
		return GL.currentContext && GL.currentContext.GLctx || GLctx;
	}
}
