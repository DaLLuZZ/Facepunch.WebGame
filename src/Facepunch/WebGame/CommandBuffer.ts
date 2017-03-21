namespace Facepunch {
    export namespace WebGame {
        export type CommandBufferAction = (gl: WebGLRenderingContext, args: ICommandBufferItem) => void;

        export interface ICommandBufferItem {
            action?: CommandBufferAction;

            parameters?: { [param: number]: Float32Array | Texture };
            parameter?: CommandBufferParameter;
            program?: WebGLProgram;
            uniform?: Uniform;
            target?: number;
            unit?: number;
            texture?: WebGLTexture;
            transpose?: boolean;
            values?: Float32Array;
            context?: RenderContext;
            cap?: number;
            enabled?: boolean;
            buffer?: WebGLBuffer;
            framebuffer?: FrameBuffer;
            fitView?: boolean;
            index?: number;
            mode?: number;
            type?: number;
            offset?: number;
            count?: number;
            size?: number;
            normalized?: boolean;
            stride?: number;
            game?: Game;
            mask?: number;
            x?: number;
            y?: number;
            z?: number;
            w?: number;
        }

        export enum CommandBufferParameter {
            ProjectionMatrix,
            InverseProjectionMatrix,
            ViewMatrix,
            InverseViewMatrix,
            CameraPos,
            ScreenParams,
            ClipParams,
            TimeParams,
            FogParams,
            FogColor,
            RefractColorMap,
            RefractDepthMap
        }

        export interface ICommandBufferParameterProvider {
            populateCommandBufferParameters(buf: CommandBuffer): void;
        }

        export class CommandBuffer {
            private context: WebGLRenderingContext;

            private commands: ICommandBufferItem[];

            private boundTextures: { [unit: number]: Texture };
            private boundBuffers: { [target: number]: WebGLBuffer };
            private capStates: { [cap: number]: boolean };

            private parameters: { [param: number]: Float32Array | Texture } = {};

            private lastCommand: ICommandBufferItem;

            constructor(context: WebGLRenderingContext) {
                this.context = context;
                this.clearCommands();
            }

            private getCommandName(action: CommandBufferAction): string {
                for (let name in this) {
                    if (this[name] as any === action) return name;
                }

                return undefined;
            }

            logCommands(): void {
                for (let i = 0, iEnd = this.commands.length; i < iEnd; ++i) {
                    const command = this.commands[i];
                    let params: string[] = [];

                    for (let name in command) {
                        if (typeof command[name] !== "function") {
                            params.push(`${name}: ${command[name]}`);
                        }
                    }

                    const paramsJoined = params.join(", ");

                    console.log(`${this.getCommandName(command.action)}(${paramsJoined})`);
                }
            }

            clearCommands(): void {
                this.boundTextures = {};
                this.boundBuffers = {};
                this.capStates = {};
                this.commands = [];
                this.lastCommand = null;
            }

            setParameter(param: CommandBufferParameter, value: Float32Array | Texture): void {
                this.parameters[param] = value;
            }

            private game: Game;

            run(renderContext: RenderContext): void {
                const gl = this.context;

                this.game = renderContext.game;

                renderContext.populateCommandBufferParameters(this);

                for (let i = 0, iEnd = this.commands.length; i < iEnd; ++i) {
                    const command = this.commands[i];
                    command.action(gl, command);
                }
            }

            private push(action: CommandBufferAction, args: ICommandBufferItem): void {
                args.action = action;
                this.commands.push(args);
                this.lastCommand = args;
            }

            clear(mask: number): void {
                this.push(this.onClear, { mask: mask });
            }

            private onClear(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.clear(args.mask);
            }

            private setCap(cap: number, enabled: boolean): void {
                if (this.capStates[cap] === enabled) return;
                this.capStates[cap] = enabled;

                this.push(enabled ? this.onEnable : this.onDisable, { cap: cap });
            }

            enable(cap: number): void {
                this.setCap(cap, true);
            }

            private onEnable(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.enable(args.cap);
            }

            disable(cap: number): void {
                this.setCap(cap, false);
            }

            private onDisable(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.disable(args.cap);
            }

            depthMask(flag: boolean): void {
                this.push(this.onDepthMask, { enabled: flag });
            }

            private onDepthMask(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.depthMask(args.enabled);
            }

            blendFuncSeparate(srcRgb: number, dstRgb: number, srcAlpha: number, dstAlpha: number): void {
                this.push(this.onBlendFuncSeparate, { x: srcRgb, y: dstRgb, z: srcAlpha, w: dstAlpha });
            }

            private onBlendFuncSeparate(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.blendFuncSeparate(args.x, args.y, args.z, args.w);
            }

            useProgram(program: ShaderProgram): void {
                this.push(this.onUseProgram, { program: program.getProgram() });
            }

            private onUseProgram(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.useProgram(args.program);
            }

            setUniformParameter(uniform: Uniform, parameter: CommandBufferParameter): void {
                if (uniform == null) return;
                const loc = uniform.getLocation();
                if (loc == null) return;

                const args: ICommandBufferItem = { uniform: uniform, parameters: this.parameters, parameter: parameter };

                if (uniform.isSampler) {
                    const sampler = uniform as UniformSampler;
                    this.setUniform1I(uniform, sampler.getTexUnit());

                    args.unit = sampler.getTexUnit();
                }

                this.push(this.onSetUniformParameter, args);
            }

            private onSetUniformParameter(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                const value = args.parameters[args.parameter];
                if (value === undefined) return;

                switch (args.parameter) {
                case CommandBufferParameter.ProjectionMatrix:
                case CommandBufferParameter.InverseProjectionMatrix:
                case CommandBufferParameter.ViewMatrix:
                case CommandBufferParameter.InverseViewMatrix:
                    gl.uniformMatrix4fv(args.uniform.getLocation(), false, value as Float32Array);
                    break;
                case CommandBufferParameter.CameraPos:
                case CommandBufferParameter.FogColor:
                    gl.uniform3f(args.uniform.getLocation(), value[0], value[1], value[2]);
                    break;
                case CommandBufferParameter.TimeParams:
                case CommandBufferParameter.ScreenParams:
                case CommandBufferParameter.ClipParams:
                case CommandBufferParameter.FogParams:
                    gl.uniform4f(args.uniform.getLocation(), value[0], value[1], value[2], value[3]);
                    break;
                case CommandBufferParameter.RefractColorMap:
                case CommandBufferParameter.RefractDepthMap:
                    const tex = value as Texture;

                    gl.activeTexture(gl.TEXTURE0 + args.unit);
                    gl.bindTexture(tex.getTarget(), tex.getHandle());
                    break;
                }
            }

            setUniform1F(uniform: Uniform, x: number): void {
                if (uniform == null || uniform.getLocation() == null) return;
                this.push(this.onSetUniform1F, { uniform: uniform, x: x });
            }

            private onSetUniform1F(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.uniform1f(args.uniform.getLocation(), args.x);
            }

            setUniform1I(uniform: Uniform, x: number): void {
                if (uniform == null || uniform.getLocation() == null) return;
                this.push(this.onSetUniform1I, { uniform: uniform, x: x });
            }

            private onSetUniform1I(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.uniform1i(args.uniform.getLocation(), args.x);
            }

            setUniform2F(uniform: Uniform, x: number, y: number): void {
                if (uniform == null || uniform.getLocation() == null) return;
                this.push(this.onSetUniform2F, { uniform: uniform, x: x, y: y });
            }

            private onSetUniform2F(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.uniform2f(args.uniform.getLocation(), args.x, args.y);
            }

            setUniform3F(uniform: Uniform, x: number, y: number, z: number): void {
                if (uniform == null || uniform.getLocation() == null) return;
                this.push(this.onSetUniform3F, { uniform: uniform, x: x, y: y, z: z });
            }

            private onSetUniform3F(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.uniform3f(args.uniform.getLocation(), args.x, args.y, args.z);
            }

            setUniform4F(uniform: Uniform, x: number, y: number, z: number, w: number): void {
                if (uniform == null || uniform.getLocation() == null) return;
                this.push(this.onSetUniform4F, { uniform: uniform, x: x, y: y, z: z, w: w });
            }

            private onSetUniform4F(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.uniform4f(args.uniform.getLocation(), args.x, args.y, args.z, args.w);
            }

            setUniformMatrix4(uniform: Uniform, transpose: boolean, values: Float32Array): void {
                if (uniform == null || uniform.getLocation() == null) return;
                this.push(this.onSetUniformMatrix4, { uniform: uniform, transpose: transpose, values: values });
            }

            private onSetUniformMatrix4(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.uniformMatrix4fv(args.uniform.getLocation(), args.transpose, args.values);
            }

            bindTexture(unit: number, value: Texture): void {
                if (this.boundTextures[unit] === value) return;
                this.boundTextures[unit] = value;

                this.push(this.onBindTexture,
                    { unit: unit + this.context.TEXTURE0, target: value.getTarget(), texture: value.getHandle() });
            }

            private onBindTexture(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.activeTexture(args.unit);
                gl.bindTexture(args.target, args.texture);
            }

            bindBuffer(target: number, buffer: WebGLBuffer): void {
                if (this.boundBuffers[target] === buffer) return;
                this.boundBuffers[target] = buffer;

                this.push(this.onBindBuffer, { target: target, buffer: buffer });
            }

            private onBindBuffer(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.bindBuffer(args.target, args.buffer);
            }

            enableVertexAttribArray(index: number): void {
                this.push(this.onEnableVertexAttribArray, { index: index });
            }

            private onEnableVertexAttribArray(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.enableVertexAttribArray(args.index);
            }

            disableVertexAttribArray(index: number): void {
                this.push(this.onDisableVertexAttribArray, { index: index });
            }

            private onDisableVertexAttribArray(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.disableVertexAttribArray(args.index);
            }

            vertexAttribPointer(index: number,
                size: number,
                type: number,
                normalized: boolean,
                stride: number,
                offset: number): void {
                this.push(this.onVertexAttribPointer, { index: index, size: size, type: type, normalized: normalized, stride: stride, offset: offset });
            }

            private onVertexAttribPointer(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.vertexAttribPointer(args.index, args.size, args.type, args.normalized, args.stride, args.offset);
            }

            drawElements(mode: number, count: number, type: number, offset: number, elemSize: number): void {
                if (this.lastCommand.action === this.onDrawElements &&
                    this.lastCommand.type === type &&
                    this.lastCommand.offset + this.lastCommand.count * elemSize === offset) {
                    this.lastCommand.count += count;
                    return;
                }

                this.push(this.onDrawElements, { mode: mode, count: count, type: type, offset: offset });
            }

            private onDrawElements(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                gl.drawElements(args.mode, args.count, args.type, args.offset);
            }

            bindFramebuffer(buffer: FrameBuffer, fitView?: boolean): void {
                this.push(this.onBindFramebuffer, { framebuffer: buffer, fitView: fitView, game: this.game });
            }

            private onBindFramebuffer(gl: WebGLRenderingContext, args: ICommandBufferItem): void {
                const buffer = args.framebuffer;

                if (buffer == null) {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    return;
                }

                if (args.fitView) {
                    buffer.resize(args.game.getWidth(), args.game.getHeight());
                }

                gl.bindFramebuffer(gl.FRAMEBUFFER, buffer.getHandle());
            }
        }
    }
}