//! Prototipo del Centro de Control en Iced (paso 6). Valores de design/tokens.json.

#[path = "../../sim.rs"]
mod sim;

use std::time::Duration;

use iced::widget::canvas::{self, Frame, Geometry, Path, Stroke};
use iced::widget::{Space, canvas as lienzo, column, container, row, stack, text};
use iced::{
    Background, Border, Color, Element, Font, Length, Point, Rectangle, Renderer, Shadow, Subscription,
    Theme, Vector, alignment, font, mouse,
};

const JURA: Font = Font::with_name("Jura");
const JURA_SEMI: Font = Font { weight: font::Weight::Semibold, ..JURA };
const JURA_NEGRITA: Font = Font { weight: font::Weight::Bold, ..JURA };

fn hex(rgb: u32, a: f32) -> Color {
    Color::from_rgba8((rgb >> 16) as u8, (rgb >> 8 & 0xff) as u8, (rgb & 0xff) as u8, a)
}

const SUPERFICIE: u32 = 0x111111;
const ACENTO: u32 = 0x3FA8FF;
const EXITO: u32 = 0x00D4AA;
const AVISO: u32 = 0xFFBB33;
const PELIGRO: u32 = 0xFF4444;
const PROGRESO: u32 = 0x22C55E;

#[derive(Debug, Clone)]
enum Mensaje {
    Paso,
}

struct App {
    sim: sim::Sim,
    indicadores: Vec<sim::Indicador>,
    calzado: f32,
    resistencia: f32,
}

impl App {
    fn new() -> Self {
        let sim = sim::Sim::new();
        let indicadores = sim.indicadores();
        Self { calzado: sim.calzado, resistencia: sim.resistencia, sim, indicadores }
    }

    fn update(&mut self, _: Mensaje) {
        self.sim.paso();
        if self.sim.toca_indicadores() {
            self.indicadores = self.sim.indicadores();
        }
        // Animación de las barras (equivale al `animate width` de Slint)
        self.calzado += (self.sim.calzado - self.calzado) * 0.08;
        self.resistencia += (self.sim.resistencia - self.resistencia) * 0.08;
    }

    fn subscription(&self) -> Subscription<Mensaje> {
        iced::time::every(Duration::from_millis(16)).map(|_| Mensaje::Paso)
    }

    fn view(&self) -> Element<'_, Mensaje> {
        let cabecera = tarjeta(
            row![
                logo(),
                Space::new().width(Length::Fill),
                boton_comandos(),
                campana(),
                text("Schormeiker Lugo").size(15),
                avatar(46.0, 58.0, 14.0),
            ]
            .spacing(18)
            .align_y(alignment::Vertical::Center)
            .padding([0, 36]),
        )
        .height(103);

        let telemetria = row(self.indicadores.iter().map(indicador)).spacing(12);

        let bpm = self.sim.bpm[sim::PUNTOS - 1].round();
        let grafico = tarjeta(
            column![
                row![
                    text("Pulso del explorador").size(18.4).font(JURA_SEMI),
                    Space::new().width(Length::Fill),
                    text(format!("{bpm} BPM")).size(22.4).font(JURA_NEGRITA).color(hex(ACENTO, 1.0)),
                ],
                lienzo(Grafico { datos: &self.sim.bpm }).width(Length::Fill).height(Length::Fill),
            ]
            .spacing(12)
            .padding([20, 24]),
        )
        .height(Length::Fill);

        let izquierda = column![text("Telemetría").size(18.4).font(JURA_SEMI), telemetria, grafico].spacing(16);

        let explorador = tarjeta(
            column![
                container(avatar(72.0, 100.0, 22.0)).center_x(Length::Fill),
                container(text("Schormeiker Lugo").size(18)).center_x(Length::Fill),
                container(text("⚡ Explorador").size(12.5).color(hex(0x888888, 1.0))).center_x(Length::Fill),
                barra("Estado del Calzado", "👟", self.calzado),
                barra("Resistencia Física", "⚡", self.resistencia),
                container(text("🌤  Clima: Fresco      🌙 Noche").size(12.5).color(hex(0x888888, 1.0)))
                    .center_x(Length::Fill)
                    .padding(11)
                    .style(|_| fondo(hex(0xffffff, 0.03), 8.0)),
                container(text("VER TODO").size(11).font(JURA_NEGRITA).color(hex(ACENTO, 1.0)))
                    .center_x(Length::Fill)
                    .padding(9)
                    .style(|_| container::Style {
                        border: Border { color: hex(ACENTO, 0.3), width: 1.0, radius: 6.0.into() },
                        ..fondo(hex(ACENTO, 0.1), 6.0)
                    }),
            ]
            .spacing(18)
            .padding([30, 20]),
        )
        .width(340)
        .height(Length::Fill);

        column![cabecera, row![izquierda, explorador].spacing(30)]
            .spacing(22)
            .padding([30, 40])
            .into()
    }
}

fn fondo(color: Color, radio: f32) -> container::Style {
    container::Style {
        background: Some(Background::Color(color)),
        border: Border { radius: radio.into(), ..Border::default() },
        ..container::Style::default()
    }
}

fn tarjeta<'a>(contenido: impl Into<Element<'a, Mensaje>>) -> container::Container<'a, Mensaje> {
    container(contenido).width(Length::Fill).style(|_| fondo(hex(SUPERFICIE, 1.0), 14.0))
}

/// Iced no tiene espaciado entre letras ni sombra de texto: espacios y un halo detrás.
fn logo<'a>() -> Element<'a, Mensaje> {
    let halo = container(Space::new().width(190).height(20)).style(|_| container::Style {
        background: Some(Background::Color(hex(0xffffff, 0.02))),
        border: Border { radius: 10.0.into(), ..Border::default() },
        shadow: Shadow { color: hex(0xffffff, 0.19), offset: Vector::ZERO, blur_radius: 22.0 },
        ..container::Style::default()
    });
    stack![
        container(halo).center_y(Length::Fill).padding([0, 6]),
        container(text("K  E  P  L  E  R").size(28).font(JURA_SEMI)).center_y(Length::Fill),
    ]
    .width(220)
    .into()
}

fn boton_comandos<'a>() -> Element<'a, Mensaje> {
    container(text("▦  COMANDOS").size(13))
        .padding([8, 16])
        .style(|_| container::Style {
            border: Border { color: hex(0xffffff, 0.15), width: 1.0, radius: 6.0.into() },
            ..fondo(hex(0xffffff, 0.03), 6.0)
        })
        .into()
}

fn campana<'a>() -> Element<'a, Mensaje> {
    let insignia = container(text("1").size(9).font(JURA_NEGRITA))
        .center(Length::Fixed(20.0))
        .height(14)
        .style(|_| fondo(hex(PELIGRO, 1.0), 7.0));
    stack![
        container(text("🔔").size(18)).center(50).style(|_| fondo(hex(0x1a1a1a, 1.0), 25.0)),
        container(insignia).padding(iced::Padding { top: 2.0, left: 30.0, ..iced::Padding::ZERO }),
    ]
    .into()
}

fn avatar<'a>(ancho: f32, alto: f32, letra: f32) -> Element<'a, Mensaje> {
    container(text("SL").size(letra).color(hex(0xcccccc, 1.0)))
        .center_x(ancho)
        .center_y(alto)
        .style(move |_| container::Style {
            background: Some(Background::Gradient(
                iced::gradient::Linear::new(2.8)
                    .add_stop(0.0, hex(0x2a3a4a, 1.0))
                    .add_stop(1.0, hex(0x0d1218, 1.0))
                    .into(),
            )),
            border: Border { color: hex(0xffffff, 0.16), width: 2.0, radius: (ancho / 2.0).into() },
            shadow: Shadow { color: hex(ACENTO, 0.25), offset: Vector::ZERO, blur_radius: 18.0 },
            ..container::Style::default()
        })
        .into()
}

fn indicador(d: &sim::Indicador) -> Element<'_, Mensaje> {
    let color = match d.estado {
        0 => hex(EXITO, 1.0),
        1 => hex(AVISO, 1.0),
        _ => hex(PELIGRO, 1.0),
    };
    let punto = container(Space::new().width(6).height(6)).style(move |_| container::Style {
        shadow: Shadow { color: Color { a: 0.7, ..color }, offset: Vector::ZERO, blur_radius: 6.0 },
        ..fondo(color, 3.0)
    });
    let valores = column![
        text(&d.valor).size(22.4).font(JURA_NEGRITA),
        text(d.etiqueta).size(10.4).color(hex(0x666666, 1.0)),
    ]
    .spacing(4)
    .align_x(alignment::Horizontal::Center);
    container(stack![
        container(valores).center(Length::Fill),
        container(punto).align_right(Length::Fill).padding([10, 8]),
    ])
    .width(Length::Fill)
    .height(74)
    .style(|_| fondo(hex(SUPERFICIE, 1.0), 14.0))
    .into()
}

fn barra<'a>(titulo: &'a str, icono: &'a str, valor: f32) -> Element<'a, Mensaje> {
    let color = if valor > 0.7 {
        hex(PROGRESO, 1.0)
    } else if valor > 0.4 {
        hex(AVISO, 1.0)
    } else {
        hex(PELIGRO, 1.0)
    };
    let lleno = (valor * 1000.0).round() as u16;
    let pista = row![
        container(Space::new().height(6)).width(Length::FillPortion(lleno.max(1))).style(move |_| fondo(color, 3.0)),
        Space::new().width(Length::FillPortion((1000 - lleno).max(1))),
    ];
    column![
        row![
            container(text(icono).size(16)).center(38).style(|_| container::Style {
                border: Border { color: hex(0xffffff, 0.1), width: 1.0, radius: 10.0.into() },
                ..container::Style::default()
            }),
            text(titulo).size(13).color(hex(0xcccccc, 1.0)),
            Space::new().width(Length::Fill),
            text(format!("{:.0}%", valor * 100.0)).size(12.5).font(JURA_SEMI).color(hex(0xcccccc, 1.0)),
        ]
        .spacing(10)
        .align_y(alignment::Vertical::Center),
        container(pista).style(|_| fondo(hex(0xffffff, 0.08), 3.0)),
    ]
    .spacing(10)
    .into()
}

struct Grafico<'a> {
    datos: &'a [f32],
}

impl canvas::Program<Mensaje> for Grafico<'_> {
    type State = ();

    fn draw(&self, _: &(), renderer: &Renderer, _: &Theme, bounds: Rectangle, _: mouse::Cursor) -> Vec<Geometry> {
        let mut f = Frame::new(renderer, bounds.size());
        let (w, h) = (bounds.width, bounds.height);
        for i in 0..5 {
            let y = h * i as f32 / 4.0;
            f.fill_rectangle(Point::new(0.0, y), iced::Size::new(w, 1.0), hex(0xffffff, 0.04));
        }
        let n = self.datos.len() as f32 - 1.0;
        let punto = |i: usize, v: f32| {
            Point::new(w * i as f32 / n, h - ((v - 50.0) / 60.0).clamp(0.0, 1.0) * h)
        };
        let linea = Path::new(|p| {
            for (i, v) in self.datos.iter().enumerate() {
                if i == 0 { p.move_to(punto(i, *v)) } else { p.line_to(punto(i, *v)) }
            }
        });
        let area = Path::new(|p| {
            p.move_to(Point::new(0.0, h));
            for (i, v) in self.datos.iter().enumerate() {
                p.line_to(punto(i, *v));
            }
            p.line_to(Point::new(w, h));
            p.close();
        });
        f.fill(
            &area,
            iced::widget::canvas::gradient::Linear::new(Point::ORIGIN, Point::new(0.0, h))
                .add_stop(0.0, hex(ACENTO, 0.35))
                .add_stop(1.0, hex(ACENTO, 0.0)),
        );
        f.stroke(&linea, Stroke::default().with_color(hex(ACENTO, 0.2)).with_width(8.0));
        f.stroke(&linea, Stroke::default().with_color(hex(ACENTO, 1.0)).with_width(2.0));
        vec![f.into_geometry()]
    }
}

fn main() -> iced::Result {
    iced::application(App::new, App::update, App::view)
        .title("KEPLER · prototipo Iced")
        .subscription(App::subscription)
        // Iced no selecciona pesos de una fuente variable: instancias estáticas
        .font(include_bytes!("../../../../../design/fonts/Jura-Regular.ttf").as_slice())
        .font(include_bytes!("../../../../../design/fonts/Jura-Medium.ttf").as_slice())
        .font(include_bytes!("../../../../../design/fonts/Jura-SemiBold.ttf").as_slice())
        .font(include_bytes!("../../../../../design/fonts/Jura-Bold.ttf").as_slice())
        .default_font(JURA)
        .window_size((1440.0, 900.0))
        .style(|_, _| iced::theme::Style { background_color: Color::BLACK, text_color: Color::WHITE })
        .run()
}
